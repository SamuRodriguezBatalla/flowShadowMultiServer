const { Events, EmbedBuilder } = require('discord.js');
const { loadTribes, saveTribes, loadGuildConfig, getAllPremiumGuilds, updateLastAlert } = require('../utils/dataManager');
const { updateLog } = require('../utils/logger');
const { sincronizarRegistros } = require('../utils/syncManager'); // <--- IMPORTAMOS AL POLICÍA

// Tiempos
const CHECK_INTERVAL = 300000; // 5 Minutos
const MS_TO_WARN = 6 * 24 * 60 * 60 * 1000; // 6 Días
const MS_TO_DELETE = 7 * 24 * 60 * 60 * 1000; // 7 Días

let isSyncing = false;

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`✅ Bot Online: ${client.user.tag} - Sistema Multi-Server V2.`);
        
        // Ejecución Inmediata al encender
        runMaintenance(client);

        // Bucle infinito cada 5 mins
        setInterval(() => runMaintenance(client), CHECK_INTERVAL);
    },
};

async function runMaintenance(client) {
    if (isSyncing) return;
    isSyncing = true;

    // 1. MANTENIMIENTO POR SERVIDOR
    for (const guild of client.guilds.cache.values()) {
        try {
            const config = loadGuildConfig(guild.id);
            if (!config) continue;

            // A. POLICÍA DE REGISTROS (Crea canales a quien le falte)
            await sincronizarRegistros(guild, config);

            // B. VIGILANCIA DE TRIBUS (Inactividad)
            await checkTribes(guild, config, client);

        } catch (e) {
            console.error(`Error mantenimiento ${guild.name}:`, e.message);
        }
    }

    // 2. PAGOS
    await checkPayments(client);

    isSyncing = false;
}

async function checkTribes(guild, config, client) {
    let tribes = loadTribes(guild.id);
    let modified = false;
    const now = Date.now();
    const toDelete = [];

    for (const [tName, tData] of Object.entries(tribes)) {
        const diff = now - (tData.lastActive || 0);
        
        // Aviso
        if (tData.channelId && diff >= MS_TO_WARN && diff < MS_TO_WARN + CHECK_INTERVAL) {
            const ch = guild.channels.cache.get(tData.channelId);
            if (ch) ch.send({ embeds: [new EmbedBuilder().setTitle('⚠️ AVISO').setDescription('Check-in necesario.').setColor('Red')] }).catch(()=>{});
        }
        // Borrar
        if (diff > MS_TO_DELETE) toDelete.push(tName);
    }

    for (const tName of toDelete) {
        const t = tribes[tName];
        guild.channels.cache.get(t.channelId)?.delete().catch(()=>{});
        guild.roles.cache.find(r => r.name === tName)?.delete().catch(()=>{});
        delete tribes[tName];
        modified = true;
    }
    if (modified) { saveTribes(guild.id, tribes); await updateLog(guild, client); }
}

async function checkPayments(client) {
    try {
        const alertChannel = client.channels.cache.find(c => c.name === '🔔・alertas-pagos');
        if (!alertChannel) return;
        const premiumGuilds = getAllPremiumGuilds();
        const now = Date.now();

        for (const pg of premiumGuilds) {
            if (pg.is_unlimited === 1) continue;
            const days = Math.floor((now - pg.added_at) / 86400000);
            if (days > 0 && days % 30 === 0 && (now - pg.last_alert > 86400000)) {
                await alertChannel.send(`💰 **COBRO:** Cliente ${pg.client_name} (${pg.guild_id}) - ${days} días.`);
                updateLastAlert(pg.guild_id);
            }
        }
    } catch (e) {}
}