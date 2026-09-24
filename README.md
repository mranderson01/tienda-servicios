# 🛡️ Tienda de Servicios de Pentesting & Cloud Security

[![AWS Architecture](https://img.shields.io/badge/AWS-Cloud%20Architecture-232F3E?style=for-the-badge&logo=amazon-aws&logoColor=white)](https://aws.amazon.com/)
[![Docker](https://img.shields.io/badge/Docker-Containerized-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-API%20RESTful-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![MariaDB](https://img.shields.io/badge/MariaDB-Relational%20DB-003545?style=for-the-badge&logo=mariadb&logoColor=white)](https://mariadb.org/)
[![IFCD67](https://img.shields.io/badge/SEPE-IFCD67%20Cloud%20Deployer-orange?style=for-the-badge)](https://www.sepe.es/)

Este repositorio contiene la solución completa de la **Tienda de Servicios de Pentesting**, una plataforma empresarial web diseñada y preparada para ser desplegada en la nube de **Amazon Web Services (AWS)** bajo el estándar oficial **Cloud Deployer (IFCD67)**.

El proyecto implementa un modelo desacoplado de 3 capas (Frontend estático, Backend API RESTful y Base de Datos Relacional) respetando los principios de **Seguridad Informática desde el Inicio (*Security by Design*)**, escalabilidad automática y alta disponibilidad.

---

## 📑 Alineación con el Programa Formativo IFCD67 (Cloud Deployer)

La arquitectura y metodología de trabajo de este proyecto se mapean directamente con los cuatro módulos del programa oficial:

* **Módulo 1: Metodología y Conceptos Clave (75h):** Control de versiones y gestión de repositorio en **Git / GitHub**, metodologías ágiles (Kanban/Scrum), concienciación de seguridad y diseño con menor privilegio.
* **Módulo 2: Virtualización y Tecnología Web (75h):** Integración de API RESTful con **Node.js (Express)**, persistencia relacional en **MariaDB / Amazon RDS**, despliegue en redes VPC públicas/privadas y cifrado de contraseñas.
* **Módulo 3: Servicios Cloud, Desarrollos y Herramientas (100h):** Contenerización con **Docker / Amazon ECR**, orquestación *Serverless* en **AWS ECS (Fargate)**, distribución vía **Amazon CloudFront / S3**, DNS en **AWS Route 53** y protección perimetral con **AWS WAF**.
* **Módulo 4: Desarrollo de una Solución Cloud (50h):** Auditoría, monitorización centralizada con **Amazon CloudWatch**, control presupuestario con **AWS Budgets** y documentación técnica.

---

## 🏗️ Arquitectura de la Solución (Local vs. AWS Cloud)

### 💻 1. Entorno de Desarrollo Local (Docker Engine / Kali Linux)
Para pruebas locales y desarrollo continuo, la solución se compone de contenedores Docker aislados mediante `docker-compose`:
* **Frontend:** Interfaz web estática (`HTML5 / CSS3 / JavaScript ES6`).
* **Backend API:** Servidor **Node.js (Express)** en puerto `3000` con autenticación JWT y cifrado de claves mediante `bcryptjs`.
* **Base de Datos:** Motor **MariaDB 10.11** en puerto `3306` con volumen persistente (`mariadb_data`).

### ☁️ 2. Arquitectura de Producción en AWS (IFCD67 Compliant)

```text
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                ARQUITECTURA CLOUD DE PRODUCCIÓN EN AWS (IFCD67)             │
 │                                                                             │
 │  [ Navegador Cliente / Usuario ]                                            │
 │         │                                                                   │
 │         ▼                                                                   │
 │  [ AWS Route 53 ] ──► DNS y Certificado SSL/TLS (ACM)            [Módulo 3] │
 │         │                                                                   │
 │         ▼                                                                   │
 │  [ AWS WAF ] ──► Cortafuegos Web / Reglas Anti-SQLi/XSS          [Módulo 3] │
 │         │                                                                   │
 │         ├─────────────────────────────────────────┐                         │
 │         ▼                                         ▼                         │
 │  [ Amazon CloudFront / S3 ]             [ Application Load Balancer (ALB) ] │
 │  (Interfaz Web Estática)                (Subred Pública VPC)     [Módulo 2/3]│
 │  [Módulo 1/3]                                     │                         │
 │                                                   ▼                         │
 │                                         [ AWS ECS / Fargate ]               │
 │                                         (API REST Node.js Privada)          │
 │                                         [Módulo 2/3]                        │
 │                                                   │                         │
 │                                                   ▼ (Puerto 3306)           │
 │                                         [ Amazon RDS MariaDB ]              │
 │                                         (Subred Privada / KMS)   [Módulo 2] │
 └─────────────────────────────────────────────────────────────────────────────┘
