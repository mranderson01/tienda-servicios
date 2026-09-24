const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const bcrypt = require("bcryptjs");

const app = express();
app.use(express.json());
app.use(cors());

const pool = mysql.createPool({
  host: process.env.DB_HOST || "db",
  user: process.env.DB_USER || "pentest_admin",
  password: process.env.DB_PASSWORD || "SecurePentestPass123!",
  database: process.env.DB_NAME || "pentest_store",
  waitForConnections: true,
  connectionLimit: 10,
});

// Inicialización resiliente con reintentos para soportar arranques de contenedor
async function initDB(retries = 10, delay = 3000) {
  while (retries > 0) {
    try {
      const connection = await pool.getConnection();
      await connection.query(`
        CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      connection.release();
      console.log("✔ Tabla 'users' lista en MariaDB.");
      return;
    } catch (err) {
      console.log(
        `[!] Esperando a que MariaDB responda... Reintentos restantes: ${retries - 1}`,
      );
      retries -= 1;
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  console.error("❌ No se pudo conectar a MariaDB.");
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
