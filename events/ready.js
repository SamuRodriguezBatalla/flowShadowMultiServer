const { Events, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { loadTribes, saveTribes, loadGuildConfig, getAllPremiumGuilds, updateLastAlert } = require('../utils/dataManager');
const { updateLog } = require('../utils/logger');
const { sincronizarRegistros } = require('../utils/syncManager');

const CHECK_INTERVAL = 300000; // 5 Minutos

let isSyncing = false;

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`✅ Bot Online: ${client.user.tag} - V9 (Producción / Admins Seguros).`);
        
        runMaintenance(client);
        
        setInterval(() => runMaintenance(client), CHECK_INTERVAL);
    },
};

async function runMaintenance(client) {
    if (isSyncing) return;
    isSyncing = true;

    for (const guild of client.guilds.cache.values()) {
        try {
            const config = loadGuildConfig(guild.id);
            
            if (!config) {
                // Silencioso para no llenar logs si no hay setup
                continue;
            }

            // 1. AUTO-ROL (Ahora respeta Admins)
            await autoAssignRoles(guild, config);

            // 2. SINCRONIZAR CANALES
            await sincronizarRegistros(guild, config);

            // 3. MANTENIMIENTO TRIBUS
            await checkTribes(guild, config, client);

        } catch (e) {
            console.error(`Error mantenimiento en ${guild.name}:`, e.message);
        }
    }
    
    await checkPayments(client);
    isSyncing = false;
}

async function autoAssignRoles(guild, config) {
    const unverifiedRole = guild.roles.cache.get(config.roles.unverified);
    if (!unverifiedRole) return;

    try {
        const members = await guild.members.fetch(); 
        
        const targets = members.filter(m => {
            if (m.user.bot) return false;

            // 🛡️ PROTECCIÓN DE ADMINISTRADORES ACTIVADA
            if (m.permissions.has(PermissionFlagsBits.Administrator)) {
                return false; // Si es admin, NO le tocamos los roles
            }
            
            // Comprobar roles del sistema
            const hasUnverified = m.roles.cache.has(config.roles.unverified);
            const hasSurvivor = config.roles.survivor ? m.roles.cache.has(config.roles.survivor) : false;
            const hasLeader = config.roles.leader ? m.roles.cache.has(config.roles.leader) : false;

            // Si NO tiene ninguno, es objetivo
            return !hasUnverified && !hasSurvivor && !hasLeader;
        });

        if (targets.size > 0) {
            console.log(`👥 [Auto-Role] Asignando 'No Verificado' a ${targets.size} usuarios nuevos...`);
            
            const botHighestRole = guild.members.me.roles.highest.position;

            if (botHighestRole <= unverifiedRole.position) {
                console.log(`🛑 [ERROR] Sube mi rol por encima de '${unverifiedRole.name}'.`);
                return;
            }

            for (const [id, member] of targets) {
                await member.roles.add(unverifiedRole).catch(() => {});
                // Pausa mínima para no saturar
                await new Promise(r => setTimeout(r, 200));
            }
        }
    } catch (e) {
        console.log("Error en autoAssignRoles:", e.message);
    }
}

async function checkTribes(guild, config, client) {
    let tribes = loadTribes(guild.id);
    let modified = false;
    const now = Date.now();
    const MS_TO_WARN = 6 * 24 * 60 * 60 * 1000; 
    const MS_TO_DELETE = 7 * 24 * 60 * 60 * 1000; 
    const toDelete = [];

    const logChannel = config.channels.checkin_log ? guild.channels.cache.get(config.channels.checkin_log) : null;

    for (const [tName, tData] of Object.entries(tribes)) {
        const diff = now - (tData.lastActive || 0);
        
        if (tData.channelId && diff >= MS_TO_WARN && diff < MS_TO_WARN + 3600000) {
            const ch = guild.channels.cache.get(tData.channelId);
            if (ch) ch.send({ embeds: [new EmbedBuilder().setTitle('⚠️ AVISO').setDescription('Check-in necesario.').setColor('Red')] }).catch(()=>{});
        }
        
        if (diff > MS_TO_DELETE) toDelete.push(tName);
    }

    for (const tName of toDelete) {
        const t = tribes[tName];
        if (t.channelId) guild.channels.cache.get(t.channelId)?.delete().catch(()=>{});
        guild.roles.cache.find(r => r.name === tName)?.delete().catch(()=>{});
        
        if (logChannel) logChannel.send({ embeds: [new EmbedBuilder().setDescription(`💀 **${tName}** eliminada por inactividad.`).setColor('Red')] }).catch(()=>{});
        delete tribes[tName];
        modified = true;
    }

    if (modified) { 
        saveTribes(guild.id, tribes); 
        await updateLog(guild, client); 
    }
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