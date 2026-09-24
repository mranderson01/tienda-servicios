const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
app.use(cors());

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

// Inicialización resiliente con reintentos para soportar arranques de contenedor

// Inicialización resiliente con reintentos para soportar arranques de contenedor y alta disponibilidad
async function initDB(retries = 10, delay = 3000) {
  while (retries > 0) {
    try {
      const connection = await pool.getConnection();

      // 1. Crear Tabla de Usuarios
      await connection.query(`
        CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log("✔ Tabla 'users' lista en MariaDB.");

      // 2. Crear Tabla de Servicios / Cursos de Pentesting
      await connection.query(`
        CREATE TABLE IF NOT EXISTS services (
          id INT AUTO_INCREMENT PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          price DECIMAL(10, 2) NOT NULL,
          duration VARCHAR(50) NOT NULL
        )
      `);
      console.log("✔ Tabla 'services' lista en MariaDB.");

      // 3. Comprobar e insertar catálogo inicial de prueba si está vacío
      const [rows] = await connection.query(
        "SELECT COUNT(*) AS total FROM services",
      );
      if (rows[0].total === 0) {
        console.log("⏳ Poblando catálogo inicial de servicios...");
        const initialServices = [
          [
            "Auditoría Web & APIs (OWASP)",
            "Evaluación de vulnerabilidades OWASP Top 10 en aplicaciones web y APIs RESTful.",
            499.99,
            "5 días",
          ],
          [
            "Pentesting de Red e Infraestructura",
            "Análisis de seguridad en redes internas, externas y configuraciones de cortafuegos.",
            850.0,
            "7 días",
          ],
          [
            "Auditoría de Seguridad Cloud en AWS",
            "Revisión de configuraciones en AWS IAM, S3 Buckets, Security Groups y VPC.",
            1200.0,
            "10 días",
          ],
          [
            "Hacking Ético & Red Teaming",
            "Simulación de ciberataques avanzados para medir la capacidad de respuesta de la empresa.",
            1500.0,
            "14 días",
          ],
        ];
        await connection.query(
          "INSERT INTO services (title, description, price, duration) VALUES ?",
          [initialServices],
        );
        console.log("✔ Catálogo inicial cargado correctamente.");
      }

      // Liberar la conexión devuelta al pool
      connection.release();
      console.log(
        "🚀 Base de Datos totalmente inicializada y lista para producción.",
      );
      return;
    } catch (err) {
      console.log(
        `[!] Esperando a que MariaDB responda... Reintentos restantes: ${retries - 1}`,
      );
      console.log(`    Detalle del error: ${err.message}`);
      retries -= 1;
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  console.error("❌ No se pudo conectar a MariaDB tras múltiples reintentos.");
}
initDB();

// Endpoint de Registro de Clientes (POST /api/v1/register)
app.post("/api/v1/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ status: "error", message: "Email y contraseña requeridos." });
  }

  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const [result] = await pool.execute(
      "INSERT INTO users (email, password) VALUES (?, ?)",
      [email, hashedPassword],
    );

    res.status(201).json({
      status: "success",
      message: "Usuario registrado correctamente",
      userId: result.insertId,
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res
        .status(400)
        .json({ status: "error", message: "El correo ya está registrado." });
    }
    console.error("Error interno en /register:", error);
    res
      .status(500)
      .json({ status: "error", message: "Error interno del servidor." });
  }
});

// Clave secreta para firmar tokens (en AWS se lee desde Secrets Manager)
const JWT_SECRET = process.env.JWT_SECRET;

// Endpoint de Inicio de Sesión (Login)
app.post("/api/v1/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña requeridos" });
  }

  try {
    // 1. Buscar el usuario en la base de datos MariaDB
    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);

    if (rows.length === 0) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const user = rows[0];

    // 2. Comprobar la contraseña hasheada con bcrypt
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    // 3. Generar Token JWT con tiempo de expiración (2 horas)
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "2h",
    });

    // 4. Responder con éxito y el token cifrado
    res.status(200).json({
      message: "Login exitoso",
      token: token,
      user: { id: user.id, email: user.email },
    });
  } catch (error) {
    console.error("Error en /login:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Endpoint para obtener los servicios de la empresa
app.get("/api/v1/services", (req, res) => {
  res.json({
    status: "success",
    data: [
      { id: 1, name: "Auditoría Web OWASP Top 10", price: 450, time: "3 días" },
      {
        id: 2,
        name: "Análisis de Vulnerabilidades en Red",
        price: 600,
        time: "5 días",
      },
      {
        id: 3,
        name: "Pentesting a APIs RESTful & Cloud",
        price: 800,
        time: "7 días",
      },
    ],
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend escuchando en puerto ${PORT}`));
