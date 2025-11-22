const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Crear/Conectar a la base de datos
const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
// Asegurar que la carpeta data existe
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);

// 1. INICIALIZAR TABLAS
db.exec(`
    CREATE TABLE IF NOT EXISTS guild_configs (
        guild_id TEXT PRIMARY KEY,
        config_json TEXT
    );

    CREATE TABLE IF NOT EXISTS active_tribes (
        guild_id TEXT,
        tribe_name TEXT,
        data_json TEXT,
        PRIMARY KEY (guild_id, tribe_name)
    );

    CREATE TABLE IF NOT EXISTS season_history (
        guild_id TEXT,
        season INTEGER,
        data_json TEXT,
        timestamp INTEGER,
        PRIMARY KEY (guild_id, season)
    );

    -- 👇 TABLA PREMIUM (SISTEMA DE PAGOS)
    CREATE TABLE IF NOT EXISTS premium_guilds (
        guild_id TEXT PRIMARY KEY,
        client_name TEXT,
        added_at INTEGER,
        is_unlimited INTEGER DEFAULT 0, -- 0: Mensual, 1: Ilimitado
        last_alert INTEGER DEFAULT 0    -- Fecha del último aviso enviado
    );
`);

// --- CONFIGURACIÓN ---
function loadGuildConfig(guildId) {
    const row = db.prepare('SELECT config_json FROM guild_configs WHERE guild_id = ?').get(guildId);
    return row ? JSON.parse(row.config_json) : null;
}

function saveGuildConfig(guildId, configData) {
    db.prepare('INSERT OR REPLACE INTO guild_configs (guild_id, config_json) VALUES (?, ?)').run(guildId, JSON.stringify(configData));
}

// --- TRIBUS ---
function loadTribes(guildId) {
    const rows = db.prepare('SELECT tribe_name, data_json FROM active_tribes WHERE guild_id = ?').all(guildId);
    const tribes = {};
    for (const row of rows) tribes[row.tribe_name] = JSON.parse(row.data_json);
    return tribes;
}

function saveTribes(guildId, tribesData) {
    const insert = db.prepare('INSERT OR REPLACE INTO active_tribes (guild_id, tribe_name, data_json) VALUES (?, ?, ?)');
    const deleteOld = db.prepare('DELETE FROM active_tribes WHERE guild_id = ?');
    const saveTransaction = db.transaction((tribes) => {
        deleteOld.run(guildId);
        for (const [name, data] of Object.entries(tribes)) insert.run(guildId, name, JSON.stringify(data));
    });
    saveTransaction(tribesData);
}

// --- HISTORIAL ---
function archiveSeason(guildId, seasonNumber, tribesData) {
    db.prepare('INSERT OR REPLACE INTO season_history (guild_id, season, data_json, timestamp) VALUES (?, ?, ?, ?)').run(guildId, seasonNumber, JSON.stringify(tribesData), Date.now());
}

function loadSeasonHistory(guildId, seasonNumber) {
    const row = db.prepare('SELECT data_json FROM season_history WHERE guild_id = ? AND season = ?').get(guildId, seasonNumber);
    return row ? JSON.parse(row.data_json) : null;
}

function resetServerData(guildId) {
    const row = db.prepare('SELECT config_json FROM guild_configs WHERE guild_id = ?').get(guildId);
    if (row) {
        let config = JSON.parse(row.config_json);
        config.season = 0;
        db.prepare('UPDATE guild_configs SET config_json = ? WHERE guild_id = ?').run(JSON.stringify(config), guildId);
    }
    const wipeTransaction = db.transaction(() => {
        db.prepare('DELETE FROM active_tribes WHERE guild_id = ?').run(guildId);
        db.prepare('DELETE FROM season_history WHERE guild_id = ?').run(guildId);
    });
    wipeTransaction();
    return loadGuildConfig(guildId);
}

// 👇 --- LICENCIAS Y PAGOS --- 👇

function addPremium(guildId, clientName) {
    try {
        // Por defecto entra como mensual (0)
        db.prepare('INSERT OR REPLACE INTO premium_guilds (guild_id, client_name, added_at, is_unlimited, last_alert) VALUES (?, ?, ?, 0, 0)')
          .run(guildId, clientName, Date.now());
        return true;
    } catch (e) { return false; }
}

function removePremium(guildId) {
    try {
        db.prepare('DELETE FROM premium_guilds WHERE guild_id = ?').run(guildId);
        return true;
    } catch (e) { return false; }
}

function isPremium(guildId) {
    const row = db.prepare('SELECT guild_id FROM premium_guilds WHERE guild_id = ?').get(guildId);
    return !!row; 
}

// Cambiar estado Ilimitado/Mensual
function setUnlimited(guildId, isUnlimited) {
    try {
        db.prepare('UPDATE premium_guilds SET is_unlimited = ? WHERE guild_id = ?').run(isUnlimited ? 1 : 0, guildId);
        return true;
    } catch (e) { return false; }
}

// Obtener todas las licencias (para el check de cobros)
function getAllPremiumGuilds() {
    return db.prepare('SELECT * FROM premium_guilds').all();
}

// Actualizar fecha del último aviso de cobro para no spammear
function updateLastAlert(guildId) {
    db.prepare('UPDATE premium_guilds SET last_alert = ? WHERE guild_id = ?').run(Date.now(), guildId);
}

function getAvailableSeasons(guildId) {
    // Consulta la tabla 'season_history' para obtener los números de temporada archivados
    const rows = db.prepare('SELECT DISTINCT season FROM season_history WHERE guild_id = ? ORDER BY season DESC').all(guildId);
    return rows.map(row => String(row.season)); // Devolvemos como string para la API de Discord
}

module.exports = { 
    loadGuildConfig, saveGuildConfig, 
    loadTribes, saveTribes,
    archiveSeason, loadSeasonHistory, resetServerData,
    addPremium, removePremium, isPremium, setUnlimited, getAllPremiumGuilds, updateLastAlert,
    getAvailableSeasons
};