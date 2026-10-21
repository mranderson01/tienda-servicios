const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const app = express();
app.use(express.json());
app.use(cors());

// -------------------------------------------------------------
// ☁️ Configuración común para LocalStack / AWS
// -------------------------------------------------------------
const awsConfig = {
  region: process.env.AWS_REGION || "us-east-1",
  endpoint: process.env.AWS_ENDPOINT || process.env.AWS_ENDPOINT_URL || "http://localhost:4566",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "mock_access_key",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "mock_secret_key",
  },
  forcePathStyle: true, // Obligatorio para S3 en LocalStack
};

// Clientes AWS SDK v3
const s3Client = new S3Client(awsConfig);
const secretsClient = new SecretsManagerClient(awsConfig);
const dynamoClient = new DynamoDBClient(awsConfig);
const docClient = DynamoDBDocumentClient.from(dynamoClient);

let JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_jwt";

// -------------------------------------------------------------
// 🔒 Obtener secretos y configuración desde AWS Secrets Manager
// -------------------------------------------------------------
async function loadSecretsFromCloud() {
  try {
    const command = new GetSecretValueCommand({ 
      SecretId: process.env.AWS_SECRET_ID || "app-production-credentials-seguro" 
    });
    const response = await secretsClient.send(command);
    if (response.SecretString) {
      const secrets = JSON.parse(response.SecretString);
      if (secrets.jwt_secret) {
        JWT_SECRET = secrets.jwt_secret;
      }
      console.log("✔ Secretos cargados exitosamente desde AWS Secrets Manager.");
      return secrets;
    }
  } catch (error) {
    console.log("⚠️ No se pudieron cargar los secretos de Secrets Manager (usando valores locales/env):", error.message);
  }
  return null;
}

// -------------------------------------------------------------
// 🌱 Inicialización y Seeders en DynamoDB (NoSQL)
// -------------------------------------------------------------
async function initNoSQLData() {
  try {
    console.log("⏳ Verificando e inicializando datos en DynamoDB...");

    // 1. Seeders: Catálogo de Servicios Iniciales
    const servicesScan = await docClient.send(new ScanCommand({ TableName: "Services" }));
    if (!servicesScan.Items || servicesScan.Items.length === 0) {
      console.log("⏳ Poblando catálogo inicial de servicios en DynamoDB...");
      const initialServices = [
        { id: "srv-1", title: "Auditoría Web & APIs (OWASP)", description: "Evaluación de vulnerabilidades OWASP Top 10 en aplicaciones web y APIs RESTful.", price: 499.99, duration: "5 días" },
        { id: "srv-2", title: "Pentesting de Red e Infraestructura", description: "Análisis de seguridad en redes internas, externas y configuraciones de cortafuegos.", price: 850.00, duration: "7 días" },
        { id: "srv-3", title: "Auditoría de Seguridad Cloud en AWS", description: "Revisión de configuraciones en AWS IAM, S3 Buckets, Security Groups y VPC.", price: 1200.00, duration: "10 días" },
        { id: "srv-4", title: "Hacking Ético & Red Teaming", description: "Simulación de ciberataques avanzados para medir la capacidad de respuesta de la empresa.", price: 1500.00, duration: "14 días" }
      ];

      for (const service of initialServices) {
        await docClient.send(new PutCommand({
          TableName: "Services",
          Item: service
        }));
      }
      console.log("✔ Catálogo de servicios cargado en DynamoDB.");
    }

    // 2. Seeder: Usuario Administrador por Defecto
    const adminEmail = process.env.ADMIN_EMAIL || "admin@pentest.com";
    const adminPass = process.env.ADMIN_PASSWORD || "Admin123*";
    const adminName = process.env.ADMIN_NAME || "Administrador";

    const adminCheck = await docClient.send(new GetCommand({
      TableName: "Users",
      Key: { email: adminEmail }
    }));

    if (!adminCheck.Item) {
      const hashedPassword = await bcrypt.hash(adminPass, 10);
      await docClient.send(new PutCommand({
        TableName: "Users",
        Item: {
          email: adminEmail,
          name: adminName,
          password: hashedPassword,
          roles: [process.env.ROLE_ADMIN_NAME || "admin"],
          created_at: new Date().toISOString()
        }
      }));
      console.log(`🔒 Seeder: Usuario Administrador (${adminEmail}) creado en DynamoDB.`);
    }

    // 3. Seeder: Usuario Básico por Defecto
    const basicEmail = process.env.BASIC_EMAIL || "user@pentest.com";
    const basicPass = process.env.BASIC_PASSWORD || "User123*";
    const basicName = process.env.BASIC_NAME || "Usuario Básico";

    const basicCheck = await docClient.send(new GetCommand({
      TableName: "Users",
      Key: { email: basicEmail }
    }));

    if (!basicCheck.Item) {
      const hashedPassword = await bcrypt.hash(basicPass, 10);
      await docClient.send(new PutCommand({
        TableName: "Users",
        Item: {
          email: basicEmail,
          name: basicName,
          password: hashedPassword,
          roles: [process.env.ROLE_BASIC_NAME || "basic"],
          created_at: new Date().toISOString()
        }
      }));
      console.log(`👤 Seeder: Usuario Básico (${basicEmail}) creado en DynamoDB.`);
    }

    console.log("🚀 Base de datos NoSQL (DynamoDB) inicializada correctamente.");
  } catch (err) {
    console.error("❌ Error al inicializar DynamoDB (¿Están creadas las tablas en LocalStack?):", err.message);
  }
}

// -------------------------------------------------------------
// 🛡️ Middlewares de Seguridad y Autenticación
// -------------------------------------------------------------
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Acceso denegado: Token requerido" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Token inválido o expirado" });
    req.user = user; // Contiene email y roles
    next();
  });
}

function requireRole(roleName) {
  return (req, res, next) => {
    if (!req.user || !req.user.roles || !req.user.roles.includes(roleName)) {
      return res.status(403).json({ error: `Acceso restringido: Requiere rol ${roleName}` });
    }
    next();
  };
}

// -------------------------------------------------------------
// 🌐 Endpoints de la API
// -------------------------------------------------------------

// 1. Registro de Usuarios (NoSQL)
app.post("/api/v1/register", async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ status: "error", message: "Email y contraseña requeridos." });
  }

  try {
    const existing = await docClient.send(new GetCommand({
      TableName: "Users",
      Key: { email }
    }));

    if (existing.Item) {
      return res.status(400).json({ status: "error", message: "El correo ya está registrado." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await docClient.send(new PutCommand({
      TableName: "Users",
      Item: {
        email,
        name: name || "Cliente",
        password: hashedPassword,
        roles: ["basic"], // Rol por defecto
        created_at: new Date().toISOString()
      }
    }));

    res.status(201).json({
      status: "success",
      message: "Usuario registrado correctamente en DynamoDB",
      email
    });
  } catch (error) {
    console.error("Error interno en /register:", error);
    res.status(500).json({ status: "error", message: "Error interno del servidor." });
  }
});

// 2. Login con Verificación de Roles Embebidos
app.post("/api/v1/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await docClient.send(new GetCommand({
      TableName: "Users",
      Key: { email }
    }));

    if (!result.Item) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }

    const user = result.Item;
    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }

    const token = jwt.sign(
      { email: user.email, name: user.name, roles: user.roles },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({ token, user: { email: user.email, name: user.name, roles: user.roles } });
  } catch (err) {
    console.error("Error en login:", err);
    res.status(500).json({ error: "Error en inicio de sesión" });
  }
});

// 3. Obtener Catálogo de Servicios desde DynamoDB
app.get("/api/v1/services", async (req, res) => {
  try {
    const data = await docClient.send(new ScanCommand({ TableName: "Services" }));
    // Mapeamos para mantener compatibilidad con el frontend
    const services = data.Items.map(item => ({
      id: item.id,
      name: item.title,
      description: item.description,
      price: item.price,
      time: item.duration
    }));

    res.json({
      status: "success",
      data: services
    });
  } catch (error) {
    console.error("Error al obtener servicios de DynamoDB:", error);
    res.status(500).json({ status: "error", message: "Error al consultar los servicios" });
  }
});

// 4. Subir Informe de Auditoría a S3 de LocalStack y registrar metadatos en DynamoDB
app.post("/api/v1/upload-report", authenticateToken, async (req, res) => {
  try {
    const { fileName, fileContent, reportId } = req.body;
    
    if (!fileName || !fileContent || !reportId) {
      return res.status(400).json({ error: "Faltan datos: fileName, fileContent y reportId son requeridos." });
    }

    const bucketName = process.env.S3_BUCKET_NAME || "tienda-servicios-assets-seguro";

    // 1. Subir archivo a S3
    const uploadParams = {
      Bucket: bucketName,
      Key: `${req.user.email}/${fileName}`,
      Body: fileContent,
      ContentType: "text/plain"
    };

    await s3Client.send(new PutObjectCommand(uploadParams));

    // 2. Guardar metadatos en la tabla NoSQL (InformesSeguridad)
    await docClient.send(new PutCommand({
      TableName: "InformesSeguridad",
      Item: {
        reportId: reportId,
        userId: req.user.email,
        fileName: fileName,
        s3Key: `${req.user.email}/${fileName}`,
        uploadedAt: new Date().toISOString()
      }
    }));

    res.json({
      status: "success",
      message: "Informe subido correctamente a S3 y metadatos registrados en DynamoDB",
      reportId
    });
  } catch (error) {
    console.error("Error al subir archivo a S3/DynamoDB:", error);
    res.status(500).json({ error: "Error interno al procesar el informe de seguridad" });
  }
});

// -------------------------------------------------------------
// 🚀 Arranque del Servidor
// -------------------------------------------------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`🚀 API corriendo en puerto ${PORT}`);
  await loadSecretsFromCloud();
  await initNoSQLData();
});