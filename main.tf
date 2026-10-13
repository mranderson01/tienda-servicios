terraform {
  required_version = ">= 1.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Configuración del proveedor AWS para apuntar a LocalStack
provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"

  # Banderas necesesarias para engañar a terraform y evitar timeout con LocalStack
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
  s3_use_path_style           = true

  # Redirección de endpoints hacia LocalStack
  endpoints {
    s3             = "http://127.0.0.1:4566"
    secretsmanager = "http://127.0.0.1:4566" 
  }
}

# 1. Recurso: Bucket S3 para almacenar archivos o medios de la tienda
resource "aws_s3_bucket" "tienda_assets" {
  bucket        = "tienda-servicios-assets"
  force_destroy = true
}

# 2. Recurso: Secreto en AWS Secrets Manager para las credenciales del sistema
resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "tienda/db_credentials"
  description = "Credenciales de conexion para la base de datos tiendadb"
}

resource "aws_secretsmanager_secret_version" "db_credentials_val" {
  secret_id     = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = "rodrigo"
    password = "mi_password_segura"
    database = "tiendadb"
  })
}

# Outputs para verificar los resultados tras el despliegue
output "s3_bucket_name" {
  value       = aws_s3_bucket.tienda_assets.bucket
  description = "Nombre del bucket S3 creado en LocalStack"
}

output "secret_arn" {
  value       = aws_secretsmanager_secret.db_credentials.arn
  description = "ARN del secreto creado en Secrets Manager"
}