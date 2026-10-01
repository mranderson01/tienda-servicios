variable "db_username" {
  type        = string
  description = "Usuario de la base de datos"
  default     = "rodrigo"
}

variable "db_password" {
  type        = string
  description = "Contraseña de la base de datos"
  sensitive   = true
}

variable "db_name" {
  type        = string
  description = "Nombre de la base de datos"
  default     = "tiendadb"
}