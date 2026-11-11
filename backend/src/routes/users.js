const express = require("express");
const router = express.Router();
const db = require("../config/db");
const logger = require("../utils/logger");
const { validate } = require("../middleware/validate");
const {
  userCreateSchema,
  userUpdateSchema,
} = require("../schemas");
const { hashPassword } = require("../utils/passwordService");

const VALID_ROLES = ["admin", "bearbeiter", "user"];

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Alle Benutzer abrufen
 *     description: 'Ohne password_hash. Erfordert Rolle: admin.'
 *     tags: [Benutzerverwaltung]
 *     responses:
 *       200:
 *         description: Benutzerliste
 *         content:
 *           application/json:
 *             schema: { type: array, items: { $ref: '#/components/schemas/AppUser' } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get("/", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT id, username, email, role, active, must_change_password, created_at, last_login FROM app_users ORDER BY username",
    );
    logger.info("USERS", "Benutzer geladen", { anzahl: rows.length });
    res.json(rows);
  } catch (err) {
    logger.error("USERS", "Fehler beim Laden der Benutzer", {
      message: err.message,
    });
    res.status(500).json({ error: "Fehler beim Laden der Benutzer" });
  }
});

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Benutzer anlegen
 *     description: 'must_change_password wird immer auf true gesetzt. Erfordert Rolle: admin.'
 *     tags: [Benutzerverwaltung]
 *     security:
 *       - cookieAuth: []
 *         csrfHeader: []
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password, role]
 *             properties:
 *               username: { type: string, maxLength: 100 }
 *               password: { type: string, format: password, minLength: 8 }
 *               email: { type: string, nullable: true }
 *               role: { type: string, enum: [admin, bearbeiter, user] }
 *               active: { type: boolean }
 *     responses:
 *       201:
 *         description: Benutzer erstellt
 *         content: { application/json: { schema: { $ref: '#/components/schemas/AppUser' } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       409:
 *         description: Benutzername bereits vergeben
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
router.post("/", validate(userCreateSchema), async (req, res) => {
  try {
    const { username, password, email, role, active } = req.body;
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: "Ungültige Rolle" });
    }
    const password_hash = await hashPassword(password);
    const { rows } = await db.query(
      `INSERT INTO app_users (username, password_hash, email, role, active, must_change_password)
       VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id, username, email, role, active, must_change_password, created_at`,
      [
        username,
        password_hash,
        email || null,
        role || "user",
        active !== false,
      ],
    );
    logger.info("USERS", "Benutzer erstellt", { user: username, role });
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      logger.warn("USERS", "Benutzer-Erstellung fehlgeschlagen – Name bereits vergeben", {
        user: req.body.username,
        reason: "username_taken",
      });
      return res.status(409).json({ error: "Benutzername bereits vergeben" });
    }
    logger.error("USERS", "Fehler beim Erstellen des Benutzers", {
      message: err.message,
    });
    res.status(500).json({ error: "Fehler beim Erstellen des Benutzers" });
  }
});

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Benutzer aktualisieren (ohne Passwort)
 *     description: 'Für das Passwort siehe POST /auth/admin/generate-reset-link. Erfordert Rolle: admin.'
 *     tags: [Benutzerverwaltung]
 *     security:
 *       - cookieAuth: []
 *         csrfHeader: []
 *       - bearerAuth: []
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, role]
 *             properties:
 *               username: { type: string, maxLength: 100 }
 *               email: { type: string, nullable: true }
 *               role: { type: string, enum: [admin, bearbeiter, user] }
 *               active: { type: boolean }
 *     responses:
 *       200:
 *         description: Benutzer aktualisiert
 *         content: { application/json: { schema: { $ref: '#/components/schemas/AppUser' } } }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       409:
 *         description: Benutzername bereits vergeben
 *         content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
 */
router.put("/:id", validate(userUpdateSchema), async (req, res) => {
  try {
    const { username, email, role, active } = req.body;
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: "Ungültige Rolle" });
    }
    const { rows } = await db.query(
      `UPDATE app_users SET username = $1, email = $2, role = $3, active = $4
       WHERE id = $5 RETURNING id, username, email, role, active, created_at, last_login`,
      [username, email || null, role, active, req.params.id],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Benutzer nicht gefunden" });
    }
    logger.info("USERS", "Benutzer aktualisiert", { id: req.params.id, user: username });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      logger.warn("USERS", "Benutzer-Update fehlgeschlagen – Name bereits vergeben", {
        id: req.params.id,
        reason: "username_taken",
      });
      return res.status(409).json({ error: "Benutzername bereits vergeben" });
    }
    logger.error("USERS", "Fehler beim Aktualisieren des Benutzers", {
      id: req.params.id,
      message: err.message,
    });
    res.status(500).json({ error: "Fehler beim Aktualisieren des Benutzers" });
  }
});

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Benutzer löschen
 *     description: 'Erfordert Rolle: admin.'
 *     tags: [Benutzerverwaltung]
 *     security:
 *       - cookieAuth: []
 *         csrfHeader: []
 *       - bearerAuth: []
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Benutzer gelöscht
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete("/:id", async (req, res) => {
  try {
    const { rowCount } = await db.query("DELETE FROM app_users WHERE id = $1", [
      req.params.id,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: "Benutzer nicht gefunden" });
    }
    logger.info("USERS", "Benutzer gelöscht", { id: req.params.id });
    res.json({ message: "Benutzer gelöscht" });
  } catch (err) {
    logger.error("USERS", "Fehler beim Löschen des Benutzers", {
      id: req.params.id,
      message: err.message,
    });
    res.status(500).json({ error: "Fehler beim Löschen des Benutzers" });
  }
});

module.exports = router;
