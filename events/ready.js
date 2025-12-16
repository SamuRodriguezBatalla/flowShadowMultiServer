const { Events, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { loadTribes, saveTribes, loadGuildConfig, getAllPremiumGuilds, updateLastAlert, getGameBans, removeGameBan, getRegistrationState } = require('../utils/dataManager');
const { updateLog } = require('../utils/logger');
const { sendRconCommand } = require('../utils/rconManager');
const { updateStatusPanels } = require('../utils/statusUpdater');
// CONFIGURACIÓN DE TIEMPOS
const MAINTENANCE_INTERVAL = 5 * 60 * 1000; // Ejecutar mantenimiento cada 5 minutos
const MAX_REGISTRATION_AGE = 60 * 60 * 1000; // 1 Hora de inactividad permitida en registros

let isSyncing = false;

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`✅ Bot Online: ${client.user.tag} - Sistema V16 (Protección de Espera + Optimizado).`);
        
        // Ejecución inicial
        runMaintenance(client);
        
        // Bucle infinito
        setInterval(() => runMaintenance(client), MAINTENANCE_INTERVAL);
    },
};

async function runMaintenance(client) {
    if (isSyncing) return;
    isSyncing = true;

    // Iterar sobre todos los servidores
    for (const guild of client.guilds.cache.values()) {
        try {
            const config = loadGuildConfig(guild.id);
            if (!config) continue;

            // A) AUTO-ROL (Solo asignar rol, NO crear canales para evitar lag)
            await autoAssignRoles(guild, config);

            // B) MANTENIMIENTO TRIBUS (Check-in y borrado por inactividad)
            await checkTribes(guild, config, client);

            // C) LIMPIEZA DE REGISTROS INACTIVOS (Recolector de Basura)
            await checkRegistrationTimeouts(guild, config);

            // D) BANEOS TEMPORALES ARK (Desbaneo automático)
            await checkGameBans(guild);
	   // F) ACTUALIZAR PANELES DE ESTADO
	   console.log("📡 Actualizando paneles de estado...");
           await updateStatusPanels(client);

	   isSyncing = false;

        } catch (e) {
            console.error(`Error mantenimiento en ${guild.name}:`, e.message);
        }
    }
    
    // E) SISTEMA DE PAGOS
    await checkPayments(client);
    
    isSyncing = false;
}

// --- 1. AUTO-ASSIGN ROLES ---
async function autoAssignRoles(guild, config) {
    const unverifiedRole = guild.roles.cache.get(config.roles.unverified);
    if (!unverifiedRole) return;

    try {
        // Usamos fetch con timeout para no bloquear el bot si Discord va lento
        let members = guild.members.cache;
        try { members = await guild.members.fetch({ time: 5000 }); } catch (e) {}

        const targets = members.filter(m => {
            if (m.user.bot) return false;
            if (m.permissions.has(PermissionFlagsBits.Administrator)) return false; // Ignorar Admins
            
            const hasSys = [config.roles.unverified, config.roles.survivor, config.roles.leader].some(id => m.roles.cache.has(id));
            // Si no tiene ningún rol del sistema, es nuevo
            return !hasSys;
        });

        if (targets.size > 0) {
            for (const [id, member] of targets) {
                await member.roles.add(unverifiedRole).catch(() => {});
                // Pausa pequeña para evitar Rate Limits
                await new Promise(r => setTimeout(r, 500));
            }
        }
    } catch (e) {}
}

// --- 2. CHECK TRIBES (MANTENIMIENTO BASES) ---
async function checkTribes(guild, config, client) {
    let tribes = loadTribes(guild.id);
    let modified = false;
    const now = Date.now();
    
    // Tiempos de caducidad (Ej: 7 días)
    const MS_TO_WARN = 6 * 24 * 60 * 60 * 1000; // Aviso a los 6 días
    const MS_TO_DELETE = 7 * 24 * 60 * 60 * 1000; // Borrado a los 7 días
    
    const toDelete = [];
    const logChannel = config.channels.checkin_log ? guild.channels.cache.get(config.channels.checkin_log) : null;

    for (const [tName, tData] of Object.entries(tribes)) {
        const diff = now - (tData.lastActive || 0);
        
        // AVISO (Faltan 24h)
        if (tData.channelId && diff >= MS_TO_WARN && diff < MS_TO_WARN + MAINTENANCE_INTERVAL) {
            const ch = guild.channels.cache.get(tData.channelId);
            if (ch) {
                ch.send({ 
                    content: '@here', 
                    embeds: [new EmbedBuilder()
                        .setTitle('⚠️ AVISO DE INACTIVIDAD')
                        .setDescription('Vuestra base está a punto de ser borrada por inactividad.\nUsad `/tribu checkin` antes de 24 horas.')
                        .setColor('Red')
                    ] 
                }).catch(()=>{});
            }
            
            // Intentar avisar al líder por MD
            const leader = tData.members.find(m => m.rango === 'Líder');
            if (leader) {
                try {
                    const u = await guild.client.users.fetch(leader.discordId);
                    await u.send(`⚠️ **URGENTE:** Tu tribu **${tName}** en **${guild.name}** va a ser eliminada mañana por inactividad. Entra y haz check-in.`);
                } catch(e){}
            }
        }
        
        // BORRADO (Tiempo cumplido)
        if (diff > MS_TO_DELETE) {
            toDelete.push(tName);
        }
    }

    for (const tName of toDelete) {
        const t = tribes[tName];
        // Borrar canal y rol
        if (t.channelId) guild.channels.cache.get(t.channelId)?.delete('Inactividad tribu').catch(()=>{});
        const role = guild.roles.cache.find(r => r.name === tName);
        if (role) role.delete().catch(()=>{});
        
        // Log público
        if (logChannel) {
            logChannel.send({ 
                embeds: [new EmbedBuilder().setDescription(`💀 **${tName}** eliminada por inactividad (7 días sin check-in).`).setColor('Red')] 
            }).catch(()=>{});
        }
        
        delete tribes[tName];
        modified = true;
    }

    if (modified) { 
        saveTribes(guild.id, tribes); 
        await updateLog(guild, client); 
    }
}

// --- 3. RECOLECTOR DE BASURA (REGISTROS) ---
async function checkRegistrationTimeouts(guild, config) {
    const privateCatId = config.categories.private_registration;
    if (!privateCatId) return;

    const category = guild.channels.cache.get(privateCatId);
    if (!category) return;

    const now = Date.now();

    // Buscar canales de registro
    const regChannels = category.children.cache.filter(c => 
        c.type === ChannelType.GuildText && 
        c.name.includes('registro')
    );

    for (const [id, channel] of regChannels) {
        
        // 🛡️ PROTECCIÓN: Si está esperando a la tribu (Paso 10), NO BORRAR
        // Consultamos la base de datos para ver el estado real
        const state = getRegistrationState(channel.id);
        if (state && state.step === 10) {
            // Está esperando aprobación -> Saltamos este canal
            continue; 
        }

        // Calcular tiempo inactivo
        const lastMessage = channel.lastMessageId 
            ? await channel.messages.fetch(channel.lastMessageId).catch(() => null) 
            : null;
        
        const lastActivity = lastMessage ? lastMessage.createdTimestamp : channel.createdTimestamp;
        
        // Si ha pasado más de 1 HORA sin actividad
        if (now - lastActivity > MAX_REGISTRATION_AGE) {
            console.log(`🗑️ [Timeout] Limpiando canal inactivo: ${channel.name}`);

            // Intentar identificar al usuario para avisarle
            let userId = null;
            if (state) userId = state.user_id;
            else if (channel.topic && channel.topic.includes('USER:')) {
                const match = channel.topic.match(/USER:(\d+)/);
                if (match) userId = match[1];
            }

            if (userId) {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member) {
                    // 1. Intentar MD
                    let dmSent = false;
                    try {
                        await member.send({
                            embeds: [new EmbedBuilder()
                                .setTitle('⏳ Registro Cancelado')
                                .setColor('Red')
                                .setDescription('Tu canal de registro se ha cerrado automáticamente tras **1 hora** sin actividad.')
                                .addFields({ name: '🔄 ¿Cómo volver?', value: 'Simplemente **escribe en cualquier chat del servidor** y se abrirá de nuevo.' })
                                .setFooter({ text: guild.name })
                            ]
                        });
                        dmSent = true;
                    } catch (e) {
                        dmSent = false;
                    }

                    // 2. Si falla MD, avisar en Log de Errores
                    if (!dmSent && config.channels.error_log) {
                        const errorChan = guild.channels.cache.get(config.channels.error_log);
                        if (errorChan) {
                            await errorChan.send({
                                content: `${member}`, // Mención
                                embeds: [new EmbedBuilder()
                                    .setTitle('⚠️ Registro Caducado')
                                    .setColor('Orange')
                                    .setDescription(`El canal de **${member.user.tag}** fue eliminado por inactividad.`)
                                    .addFields({ name: 'Nota', value: 'Tiene MDs bloqueados. Debe escribir en el chat para reiniciar.' })
                                    .setTimestamp()
                                ]
                            });
                        }
                    }
                }
            }

            // Borrar canal y limpiar DB
            await channel.delete('Limpieza automática por inactividad').catch(e => console.error(`Error borrando ${channel.name}:`, e.message));
        }
    }
}

// --- 4. CHECK GAME BANS (DESBANEO AUTOMÁTICO ARK) ---
async function checkGameBans(guild) {
    const bans = getGameBans(guild.id);
    const now = Date.now();

    for (const ban of bans) {
        // Solo procesar bans "por horas" que ya han cumplido su tiempo
        if (ban.ban_type === 'horas' && ban.unban_time > 0 && now >= ban.unban_time) {
            console.log(`🔓 [Ark] Tiempo cumplido. Desbaneando a ${ban.ark_id}...`);
            
            const rconRes = await sendRconCommand(guild.id, `UnbanPlayer "${ban.ark_id}"`);
            
            if (rconRes.success) {
                removeGameBan(guild.id, ban.ark_id);
                
                // Avisar usuario por MD si es posible
                if (ban.discord_id) {
                    try {
                        const user = await guild.client.users.fetch(ban.discord_id);
                        await user.send({
                            embeds: [new EmbedBuilder()
                                .setTitle('🦖 Baneo de Ark Finalizado')
                                .setColor('Green')
                                .setDescription(`Tu sanción temporal en el servidor de Ark de **${guild.name}** ha expirado.\nYa puedes volver a entrar.`)
                                .setTimestamp()
                            ]
                        });
                    } catch (e) {}
                }
            }
        }
    }
}

// --- 5. CHECK PAYMENTS (SISTEMA PREMIUM) ---
async function checkPayments(client) {
    try {
        const alertChannel = client.channels.cache.find(c => c.name === '🔔・alertas-pagos');
        if (!alertChannel) return;
        
        const premiumGuilds = getAllPremiumGuilds();
        const now = Date.now();
        
        for (const pg of premiumGuilds) {
            if (pg.is_unlimited === 1) continue; 
            
            const days = Math.floor((now - pg.added_at) / 86400000);
            // Avisar cada 30 días exactos
            if (days > 0 && days % 30 === 0 && (now - pg.last_alert > 86400000)) {
                await alertChannel.send(`💰 **COBRO PENDIENTE:** Cliente ${pg.client_name} (ID: ${pg.guild_id}) - Lleva ${days} días activo.`);
                updateLastAlert(pg.guild_id);
            }
        }
    } catch (e) {}
}
