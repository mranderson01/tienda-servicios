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

// Inicialización resiliente con reintentos para soportar arranques de contenedor y alta disponibilidad
async function initDB(retries = 10, delay = 3000) {
  while (retries > 0) {
    try {
      const connection = await pool.getConnection();
      console.log("✔ Conexión establecida con el motor de Base de Datos.");

      // 1. Crear Tabla de Usuarios
      await connection.query(`
        CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255),
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log("✔ Tabla 'users' lista en MariaDB.");
      // 2. Tabla de Roles (Normalizada)
      await connection.query(`
                CREATE TABLE IF NOT EXISTS roles (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    name VARCHAR(50) UNIQUE NOT NULL
                )
            `);
      // 3. Tabla Intermedia entre Users y Roles
      await connection.query(`
                CREATE TABLE IF NOT EXISTS user_roles (
                    user_id INT NOT NULL,
                    role_id INT NOT NULL,
                    PRIMARY KEY (user_id, role_id),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
                )
            `);
      // 4. Catálogo de Servicios
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
      // 5. Carrito Persistente
      await connection.query(`
                CREATE TABLE IF NOT EXISTS cart_items (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    service_id INT NOT NULL,
                    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
                    UNIQUE KEY user_service_unique (user_id, service_id)
                )
            `);

      // 6. Pedidos
      await connection.query(`
                CREATE TABLE IF NOT EXISTS orders (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT NOT NULL,
                    total_amount DECIMAL(10, 2) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `);

      // 7. Detalle de Pedidos
      await connection.query(`
                CREATE TABLE IF NOT EXISTS order_items (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    order_id INT NOT NULL,
                    service_id INT NOT NULL,
                    price DECIMAL(10, 2) NOT NULL,
                    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
                    FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
                )
            `);

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
      // Seeders: Crear Usuario Administrador leyendo desde Variables de Entorno (Sin Hardcode)
      const adminEmail = process.env.ADMIN_EMAIL;
      const adminPass = process.env.ADMIN_PASSWORD;

      if (adminEmail && adminPass) {
        const [adminCheck] = await connection.query(
          "SELECT id FROM users WHERE email = ?",
          [adminEmail],
        );
        if (adminCheck.length === 0) {
          const hashedPass = await bcrypt.hash(adminPass, 10);
          const [userRes] = await connection.query(
            "INSERT INTO users (email, password) VALUES (?, ?)",
            [adminEmail, hashedPass],
          );
          const newUserId = userRes.insertId;

          // Asignar Rol Administrador (role_id = 1) en la tabla intermedia
          await connection.query(
            "INSERT INTO user_roles (user_id, role_id) VALUES (?, 1)",
            [newUserId],
          );
          console.log(
            `🔒 Usuario Administrador de inicialización registrado dinámicamente.`,
          );
        }
      }

      // -------------------------------------------------------------
      // 🌱 SEEDER 1: Inserción de Nombres de Roles desde .env
      // -------------------------------------------------------------
      const roleAdminName = process.env.ROLE_ADMIN_NAME;
      const roleBasicName = process.env.ROLE_BASIC_NAME;

      if (roleAdminName && roleBasicName) {
        await connection.query(
          `
          INSERT INTO roles (id, name) VALUES (1, ?), (2, ?)
          ON DUPLICATE KEY UPDATE name=VALUES(name);
        `,
          [roleAdminName, roleBasicName],
        );
        console.log(
          `🌱 Roles '${roleAdminName}' y '${roleBasicName}' sembrados desde .env.`,
        );
      } else {
        console.log(
          "⚠️ No se definieron ROLE_ADMIN_NAME o ROLE_BASIC_NAME en el .env.",
        );
      }

      // -------------------------------------------------------------
      // 🌱 SEEDER 2: Usuario Administrador desde .env
      // -------------------------------------------------------------
      const adminName = process.env.ADMIN_NAME;

      if (adminEmail && adminPass) {
        const [adminCheck] = await connection.query(
          "SELECT id FROM users WHERE email = ?",
          [adminEmail],
        );
        if (adminCheck.length === 0) {
          const hashedPass = await bcrypt.hash(adminPass, 10);
          const [userRes] = await connection.query(
            "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
            [adminName || "Admin", adminEmail, hashedPass],
          );
          const adminId = userRes.insertId;

          // Asignar rol Admin (role_id = 1) en user_roles
          await connection.query(
            "INSERT INTO user_roles (user_id, role_id) VALUES (?, 1)",
            [adminId],
          );
          console.log(
            `🔒 Seeder: Usuario Admin '${adminName}' (${adminEmail}) creado dinámicamente.`,
          );
        }
      }

      // -------------------------------------------------------------
      // 🌱 SEEDER 3: Usuario Básico desde .env
      // -------------------------------------------------------------
      const basicName = process.env.BASIC_NAME;
      const basicEmail = process.env.BASIC_EMAIL;
      const basicPass = process.env.BASIC_PASSWORD;

      if (basicEmail && basicPass) {
        const [basicCheck] = await connection.query(
          "SELECT id FROM users WHERE email = ?",
          [basicEmail],
        );
        if (basicCheck.length === 0) {
          const hashedPass = await bcrypt.hash(basicPass, 10);
          const [userRes] = await connection.query(
            "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
            [basicName || "User", basicEmail, hashedPass],
          );
          const basicId = userRes.insertId;

          // Asignar rol Basic (role_id = 2) en user_roles
          await connection.query(
            "INSERT INTO user_roles (user_id, role_id) VALUES (?, 2)",
            [basicId],
          );
          console.log(
            `👤 Seeder: Usuario Básico '${basicName}' (${basicEmail}) creado dinámicamente.`,
          );
        }
      }

      // -------------------------------------------------------------
      // 🌱 SEEDER 4: Poblado del Catálogo de Servicios
      // -------------------------------------------------------------
      const [servicesRows] = await connection.query(
        "SELECT COUNT(*) AS total FROM services",
      );
      if (servicesRows[0].total === 0) {
        const initialServices = [
          [
            "Auditoría Web & APIs (OWASP)",
            "Evaluación de vulnerabilidades OWASP Top 10.",
            499.99,
            "5 días",
          ],
          [
            "Pentesting de Red e Infraestructura",
            "Análisis de seguridad en redes internas/externas.",
            850.0,
            "7 días",
          ],
          [
            "Auditoría de Seguridad Cloud AWS",
            "Revisión de IAM, S3, Security Groups y VPC.",
            1200.0,
            "10 días",
          ],
          [
            "Hacking Ético & Red Teaming",
            "Simulación de ciberataques avanzados.",
            1500.0,
            "14 días",
          ],
        ];
        await connection.query(
          "INSERT INTO services (title, description, price, duration) VALUES ?",
          [initialServices],
        );
        console.log("✔ Catálogo base de servicios cargado.");
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
      console.log(`Detalle del error: ${err.message}`);
      retries -= 1;
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  console.error("❌ No se pudo conectar a MariaDB tras múltiples reintentos.");
}

// Middleware de Autenticación JWT que extrae Roles desde la Tabla Intermedia
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Acceso denegado" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Token inválido" });
    req.user = user; // Contiene id, email y array de roles
    next();
  });
}

function requireRole(roleName) {
  return (req, res, next) => {
    if (!req.user || !req.user.roles.includes(roleName)) {
      return res
        .status(403)
        .json({ error: `Acceso restringido: Requiere rol ${roleName}` });
    }
    next();
  };
}

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

// Login con Consulta JOIN para obtener Roles
app.post("/api/v1/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const [users] = await pool.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);
    if (users.length === 0)
      return res.status(401).json({ error: "Credenciales incorrectas" });

    const user = users[0];
    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass)
      return res.status(401).json({ error: "Credenciales incorrectas" });

    // Consulta relacional N:M para obtener los roles asociados al usuario
    const [rolesResult] = await pool.query(
      `
            SELECT r.name FROM roles r
            JOIN user_roles ur ON r.id = ur.role_id
            WHERE ur.user_id = ?
        `,
      [user.id],
    );

    const userRoles = rolesResult.map((r) => r.name);

    const token = jwt.sign(
      { id: user.id, email: user.email, roles: userRoles },
      JWT_SECRET,
      { expiresIn: "8h" },
    );
    res.json({ token, user: { email: user.email, roles: userRoles } });
  } catch (err) {
    res.status(500).json({ error: "Error en inicio de sesión" });
  }
});

const PORT = process.env.PORT;
app.listen(PORT, async () => {
  console.log(`🚀 API en puerto ${PORT}`);
  await initDB();
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
