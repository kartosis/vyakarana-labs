# Single DynamoDB table (docs/ARCHITECTURE.md §5). Provisioned capacity stays inside the
# always-free 25 RCU / 25 WCU (table 10/10 + GSI 5/5); the LSI shares the table's capacity.

terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

variable "name" {
  type    = string
  default = "vl"
}

resource "aws_dynamodb_table" "main" {
  name                        = "${var.name}-main"
  billing_mode                = "PROVISIONED"
  read_capacity               = 10
  write_capacity              = 10
  hash_key                    = "PK"
  range_key                   = "SK"
  deletion_protection_enabled = true

  attribute {
    name = "PK"
    type = "S"
  }
  attribute {
    name = "SK"
    type = "S"
  }
  attribute {
    name = "LSI1SK"
    type = "S"
  }
  attribute {
    name = "GSI1PK"
    type = "S"
  }
  attribute {
    name = "GSI1SK"
    type = "S"
  }

  # Due review cards per learner: Query PK = USER#sub, LSI1SK <= DUE#now
  local_secondary_index {
    name            = "LSI1"
    range_key       = "LSI1SK"
    projection_type = "ALL"
  }

  # Weekly leaderboard (sparse: only opted-in learners carry GSI1 keys)
  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
    read_capacity   = 5
    write_capacity  = 5
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = false # costs per GB-month; enable once the site has real users to protect
  }
}

output "table_name" {
  value = aws_dynamodb_table.main.name
}

output "table_arn" {
  value = aws_dynamodb_table.main.arn
}
