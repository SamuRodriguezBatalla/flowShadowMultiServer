const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { encrypt, decrypt } = require('./crypto');

const dbPath = path.join(__dirname, '..', 'data', 'database.sqlite');
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);

// 1. INICIALIZACIÓN
db.exec(`
    CREATE TABLE IF NOT EXISTS guild_configs ( guild_id TEXT PRIMARY KEY, config_json TEXT );
    CREATE TABLE IF NOT EXISTS active_tribes ( guild_id TEXT, tribe_name TEXT, data_json TEXT, PRIMARY KEY (guild_id, tribe_name) );
    CREATE TABLE IF NOT EXISTS season_history ( guild_id TEXT, season INTEGER, data_json TEXT, timestamp INTEGER, PRIMARY KEY (guild_id, season) );
    CREATE TABLE IF NOT EXISTS permanent_bans ( guild_id TEXT, discord_id TEXT, reason TEXT, admin_id TEXT, timestamp INTEGER, PRIMARY KEY (guild_id, discord_id) );
    CREATE TABLE IF NOT EXISTS game_bans ( guild_id TEXT, discord_id TEXT, ark_id TEXT, ban_type TEXT, unban_time INTEGER, reason TEXT, admin_id TEXT, timestamp INTEGER );
    CREATE TABLE IF NOT EXISTS pending_registrations ( channel_id TEXT PRIMARY KEY, user_id TEXT, step INTEGER, data_id TEXT, data_tribe TEXT, timestamp INTEGER );
    CREATE TABLE IF NOT EXISTS status_panels ( guild_id TEXT PRIMARY KEY, channel_id TEXT, message_id TEXT );
    -- LICENCIAS (SIN TIERS)
    CREATE TABLE IF NOT EXISTS premium_guilds (
        guild_id TEXT PRIMARY KEY,
        client_name TEXT,
        added_at INTEGER,
        is_unlimited INTEGER DEFAULT 0, 
        last_alert INTEGER DEFAULT 0
    );

    -- ARK CLUSTER (MULTI-MAPA)
    CREATE TABLE IF NOT EXISTS ark_cluster_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT,
        server_name TEXT,
        ip TEXT,
        port INTEGER,
        password_enc TEXT
    );
`);

// --- CONFIGURACIÓN & TRIBUS ---
function loadGuildConfig(guildId) { const row = db.prepare('SELECT config_json FROM guild_configs WHERE guild_id = ?').get(guildId); return row ? JSON.parse(row.config_json) : null; }
function saveGuildConfig(guildId, configData) { db.prepare('INSERT OR REPLACE INTO guild_configs (guild_id, config_json) VALUES (?, ?)').run(guildId, JSON.stringify(configData)); }
function loadTribes(guildId) { const rows = db.prepare('SELECT tribe_name, data_json FROM active_tribes WHERE guild_id = ?').all(guildId); const tribes = {}; for (const row of rows) tribes[row.tribe_name] = JSON.parse(row.data_json); return tribes; }
function saveTribes(guildId, tribesData) { const insert = db.prepare('INSERT OR REPLACE INTO active_tribes (guild_id, tribe_name, data_json) VALUES (?, ?, ?)'); const deleteOld = db.prepare('DELETE FROM active_tribes WHERE guild_id = ?'); const saveTransaction = db.transaction((tribes) => { deleteOld.run(guildId); for (const [name, data] of Object.entries(tribes)) { insert.run(guildId, name, JSON.stringify(data)); } }); saveTransaction(tribesData); }
function archiveSeason(guildId, seasonNumber, tribesData) { db.prepare('INSERT OR REPLACE INTO season_history (guild_id, season, data_json, timestamp) VALUES (?, ?, ?, ?)').run(guildId, seasonNumber, JSON.stringify(tribesData), Date.now()); }
function loadSeasonHistory(guildId, seasonNumber) { const row = db.prepare('SELECT data_json FROM season_history WHERE guild_id = ? AND season = ?').get(guildId, seasonNumber); return row ? JSON.parse(row.data_json) : null; }
function getAvailableSeasons(guildId) { const rows = db.prepare('SELECT DISTINCT season FROM season_history WHERE guild_id = ? ORDER BY season DESC').all(guildId); return rows.map(row => String(row.season)); }

function resetServerData(guildId) { 
    const row = db.prepare('SELECT config_json FROM guild_configs WHERE guild_id = ?').get(guildId); 
    if (row) { let config = JSON.parse(row.config_json); config.season = 0; db.prepare('UPDATE guild_configs SET config_json = ? WHERE guild_id = ?').run(JSON.stringify(config), guildId); } 
    const wipeTransaction = db.transaction(() => { db.prepare('DELETE FROM active_tribes WHERE guild_id = ?').run(guildId); db.prepare('DELETE FROM season_history WHERE guild_id = ?').run(guildId); db.prepare('DELETE FROM pending_registrations').run(); }); 
    wipeTransaction(); return loadGuildConfig(guildId); 
}
// NUEVA FUNCIÓN: Guarda solo UNA tribu (evita sobrescribir las demás)
function saveTribe(guildId, tribeName, tribeData) {
    const insert = db.prepare('INSERT OR REPLACE INTO active_tribes (guild_id, tribe_name, data_json) VALUES (?, ?, ?)');
    insert.run(guildId, tribeName, JSON.stringify(tribeData));
}

// NUEVA FUNCIÓN: Borra solo UNA tribu
function deleteTribe(guildId, tribeName) {
    const del = db.prepare('DELETE FROM active_tribes WHERE guild_id = ? AND tribe_name = ?');
    del.run(guildId, tribeName);
}

// --- LICENCIAS (SIN TIER) ---
function addPremium(guildId, clientName) { try { db.prepare('INSERT OR REPLACE INTO premium_guilds (guild_id, client_name, added_at, is_unlimited, last_alert) VALUES (?, ?, ?, 0, 0)').run(guildId, clientName, Date.now()); return true; } catch (e) { return false; } }
function removePremium(guildId) { try { db.prepare('DELETE FROM premium_guilds WHERE guild_id = ?').run(guildId); return true; } catch (e) { return false; } }
function isPremium(guildId) { return !!db.prepare('SELECT guild_id FROM premium_guilds WHERE guild_id = ?').get(guildId); }
function setUnlimited(guildId, isUnlimited) { try { db.prepare('UPDATE premium_guilds SET is_unlimited = ? WHERE guild_id = ?').run(isUnlimited ? 1 : 0, guildId); return true; } catch (e) { return false; } }
function getAllPremiumGuilds() { return db.prepare('SELECT * FROM premium_guilds').all(); }
function updateLastAlert(guildId) { db.prepare('UPDATE premium_guilds SET last_alert = ? WHERE guild_id = ?').run(Date.now(), guildId); }

// --- BANS ---
function addPermanentBan(guildId, discordId, reason, adminId) { db.prepare('INSERT OR REPLACE INTO permanent_bans (guild_id, discord_id, reason, admin_id, timestamp) VALUES (?, ?, ?, ?, ?)').run(guildId, discordId, reason, adminId, Date.now()); }
function removePermanentBan(guildId, discordId) { db.prepare('DELETE FROM permanent_bans WHERE guild_id = ? AND discord_id = ?').run(guildId, discordId); }
function isPermabanned(guildId, discordId) { return db.prepare('SELECT * FROM permanent_bans WHERE guild_id = ? AND discord_id = ?').get(guildId, discordId) || null; }
function getPermabanList(guildId) { return db.prepare('SELECT * FROM permanent_bans WHERE guild_id = ?').all(guildId); }

// --- ARK (CLUSTER) ---
function addArkServer(guildId, name, ip, port, password) {
    const encPass = encrypt(password);
    db.prepare('DELETE FROM ark_cluster_configs WHERE guild_id = ? AND server_name = ?').run(guildId, name);
    db.prepare('INSERT INTO ark_cluster_configs (guild_id, server_name, ip, port, password_enc) VALUES (?, ?, ?, ?, ?)').run(guildId, name, ip, port, encPass);
}
function getArkServers(guildId) {
    const rows = db.prepare('SELECT * FROM ark_cluster_configs WHERE guild_id = ?').all(guildId);
    return rows.map(r => ({ name: r.server_name, ip: r.ip, port: r.port, password: decrypt(r.password_enc) }));
}
function removeArkServer(guildId, name) { db.prepare('DELETE FROM ark_cluster_configs WHERE guild_id = ? AND server_name = ?').run(guildId, name); }

// --- GAME BANS & REGISTRO ---
function addGameBan(guildId, discordId, arkId, type, durationHours, reason, adminId) { let unbanTime = 0; if (type === 'horas' && durationHours > 0) { unbanTime = Date.now() + (durationHours * 60 * 60 * 1000); } db.prepare(`INSERT INTO game_bans (guild_id, discord_id, ark_id, ban_type, unban_time, reason, admin_id, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(guildId, discordId, arkId, type, unbanTime, reason, adminId, Date.now()); }
function removeGameBan(guildId, arkId) { db.prepare('DELETE FROM game_bans WHERE guild_id = ? AND ark_id = ?').run(guildId, arkId); }
function getGameBans(guildId) { return db.prepare('SELECT * FROM game_bans WHERE guild_id = ?').all(guildId); }
function getExpiredGameBans() { const now = Date.now(); return db.prepare("SELECT * FROM game_bans WHERE ban_type = 'horas' AND unban_time > 0 AND unban_time < ?").all(now); }
function initRegistrationState(channelId, userId) { db.prepare('INSERT OR REPLACE INTO pending_registrations (channel_id, user_id, step, data_id, data_tribe, timestamp) VALUES (?, ?, 1, NULL, NULL, ?)').run(channelId, userId, Date.now()); }
function getRegistrationState(channelId) { return db.prepare('SELECT * FROM pending_registrations WHERE channel_id = ?').get(channelId); }
function updateRegistrationState(channelId, step, dataId, dataTribe) { const current = getRegistrationState(channelId); if (!current) return; const newStep = step !== undefined ? step : current.step; const newId = dataId !== undefined ? dataId : current.data_id; const newTribe = dataTribe !== undefined ? dataTribe : current.data_tribe; db.prepare('UPDATE pending_registrations SET step = ?, data_id = ?, data_tribe = ?, timestamp = ? WHERE channel_id = ?').run(newStep, newId, newTribe, Date.now(), channelId); }
function deleteRegistrationState(channelId) { db.prepare('DELETE FROM pending_registrations WHERE channel_id = ?').run(channelId); }

// --- STATUS PANEL ---
function saveStatusPanel(guildId, channelId, messageId) {
    db.prepare('INSERT OR REPLACE INTO status_panels (guild_id, channel_id, message_id) VALUES (?, ?, ?)').run(guildId, channelId, messageId);
}

function getStatusPanel(guildId) {
    return db.prepare('SELECT * FROM status_panels WHERE guild_id = ?').get(guildId);
}

function deleteStatusPanel(guildId) {
    db.prepare('DELETE FROM status_panels WHERE guild_id = ?').run(guildId);
}

module.exports = { 
    loadGuildConfig, saveGuildConfig, loadTribes, saveTribes, archiveSeason, loadSeasonHistory, resetServerData,
    addPremium, removePremium, isPremium, setUnlimited, getAllPremiumGuilds, updateLastAlert,
    getAvailableSeasons, addPermanentBan, removePermanentBan, isPermabanned, getPermabanList,
    addArkServer, getArkServers, removeArkServer, // Exportaciones Cluster
    addGameBan, removeGameBan, getGameBans, getExpiredGameBans,
    initRegistrationState, getRegistrationState, updateRegistrationState, deleteRegistrationState,
    saveTribe,
    deleteTribe,saveStatusPanel, getStatusPanel, deleteStatusPanel
};
