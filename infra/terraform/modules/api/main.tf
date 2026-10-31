# API: Python Lambda (arm64) behind a Function URL that only CloudFront may call (OAC, AWS_IAM).
# API Gateway is deliberately absent: its free tier ends after 12 months; the Function URL is free.

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

variable "name" {
  type    = string
  default = "vl"
}

variable "package_path" {
  description = "Zip built by services/api/build.sh"
  type        = string
}

variable "table_arn" {
  type = string
}

variable "table_name" {
  type = string
}

variable "user_pool_id" {
  type = string
}

variable "user_pool_arn" {
  type = string
}

variable "client_id" {
  type = string
}

variable "distribution_arn" {
  description = "CloudFront distribution allowed to invoke the function URL"
  type        = string
}

variable "alarm_topic_arn" {
  type = string
}

variable "permissions_boundary" {
  description = "ARN of vl-app-boundary (bootstrap); the deploy role may create roles only with it"
  type        = string
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

# ---------------------------------------------------------------- IAM (least privilege)
data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api" {
  name                 = "${var.name}-app-api"
  assume_role_policy   = data.aws_iam_policy_document.assume.json
  permissions_boundary = var.permissions_boundary
}

data "aws_iam_policy_document" "api" {
  statement {
    sid = "Table"
    actions = [
      "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem",
      "dynamodb:Query", "dynamodb:BatchWriteItem", "dynamodb:BatchGetItem",
      "dynamodb:ConditionCheckItem", # ConditionCheck inside TransactWriteItems (sessions, reviews)
    ]
    resources = [var.table_arn, "${var.table_arn}/index/*"]
  }
  statement {
    sid       = "DeleteOwnAccount"
    actions   = ["cognito-idp:AdminDeleteUser"]
    resources = [var.user_pool_arn]
  }
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.api.arn}:*"]
  }
  statement {
    sid       = "Tracing"
    actions   = ["xray:PutTraceSegments", "xray:PutTelemetryRecords"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = "api"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

# ---------------------------------------------------------------- function
resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${var.name}-api"
  retention_in_days = 7
}

resource "aws_lambda_function" "api" {
  function_name    = "${var.name}-api"
  role             = aws_iam_role.api.arn
  runtime          = "python3.13"
  architectures    = ["arm64"]
  handler          = "vl_api.app.handler"
  filename         = var.package_path
  source_code_hash = filebase64sha256(var.package_path)
  memory_size      = 256
  timeout          = 10

  environment {
    variables = {
      TABLE_NAME              = var.table_name
      USER_POOL_ID            = var.user_pool_id
      CLIENT_ID               = var.client_id
      POWERTOOLS_SERVICE_NAME = "vl-api"
      POWERTOOLS_LOG_LEVEL    = "INFO"
    }
  }

  tracing_config {
    mode = "Active"
  }

  logging_config {
    log_format = "JSON"
    log_group  = aws_cloudwatch_log_group.api.name
  }

  depends_on = [aws_iam_role_policy.api]
}

resource "aws_lambda_function_url" "api" {
  function_name      = aws_lambda_function.api.function_name
  authorization_type = "AWS_IAM"
}

# ---------------------------------------------------------------- CloudFront access
resource "aws_cloudfront_origin_access_control" "api" {
  name                              = "${var.name}-api"
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_lambda_permission" "cloudfront_url" {
  statement_id           = "AllowCloudFrontInvokeFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.api.function_name
  principal              = "cloudfront.amazonaws.com"
  source_arn             = var.distribution_arn
  function_url_auth_type = "AWS_IAM"
}

resource "aws_lambda_permission" "cloudfront_invoke" {
  statement_id  = "AllowCloudFrontInvokeFunction"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "cloudfront.amazonaws.com"
  source_arn    = var.distribution_arn
}

# ---------------------------------------------------------------- alarms (free tier: 10)
resource "aws_cloudwatch_metric_alarm" "errors" {
  alarm_name          = "${var.name}-api-errors"
  alarm_description   = "API function errors"
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.api.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alarm_topic_arn]
}

resource "aws_cloudwatch_metric_alarm" "throttles" {
  alarm_name          = "${var.name}-api-throttles"
  alarm_description   = "API function throttled"
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  dimensions          = { FunctionName = aws_lambda_function.api.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alarm_topic_arn]
}

resource "aws_cloudwatch_metric_alarm" "ddb_throttles" {
  alarm_name          = "${var.name}-table-throttles"
  alarm_description   = "DynamoDB requests throttled: provisioned capacity is too low"
  namespace           = "AWS/DynamoDB"
  metric_name         = "ThrottledRequests"
  dimensions          = { TableName = var.table_name, Operation = "UpdateItem" }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alarm_topic_arn]
}

# ---------------------------------------------------------------- outputs
output "origin" {
  description = "Wire into the site module's api_origin"
  value = {
    domain_name              = trimsuffix(trimprefix(aws_lambda_function_url.api.function_url, "https://"), "/")
    oac_id                   = aws_cloudfront_origin_access_control.api.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }
}

output "function_name" {
  value = aws_lambda_function.api.function_name
}
