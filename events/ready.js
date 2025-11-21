const { Events, EmbedBuilder } = require('discord.js');
const { loadTribes, saveTribes, loadGuildConfig, getAllPremiumGuilds, updateLastAlert } = require('../utils/dataManager');
const { updateLog } = require('../utils/logger');

// CONFIGURACIÓN TRIBUS
const DAYS_TO_DELETE = 7; 
const DAYS_TO_WARN = 6;
const CHECK_INTERVAL = 3600000; // 1 Hora
const MS_TO_DELETE = DAYS_TO_DELETE * 24 * 60 * 60 * 1000; 
const MS_TO_WARN = DAYS_TO_WARN * 24 * 60 * 60 * 1000;

let isSyncing = false;

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`✅ Bot Online: ${client.user.tag} - Vigilancia Completa.`);
        
        const loop = async () => {
            if (isSyncing) return;
            isSyncing = true;
            
            // --- 1. VIGILANCIA DE TRIBUS (Inactividad) ---
            for (const guild of client.guilds.cache.values()) {
                try {
                    const config = loadGuildConfig(guild.id);
                    if (!config) continue; 
                    let tribes = loadTribes(guild.id);
                    let modified = false;
                    const now = Date.now();
                    const tribesToDelete = [];
                    const checkinChannel = config.channels.checkin_log ? guild.channels.cache.get(config.channels.checkin_log) : null;

                    for (const [tName, tData] of Object.entries(tribes)) {
                        const lastActive = tData.lastActive || 0;
                        const timeDiff = now - lastActive;
                        
                        // Aviso Día 6 (Privado)
                        if (tData.channelId && timeDiff >= MS_TO_WARN && timeDiff < (MS_TO_WARN + CHECK_INTERVAL)) {
                            const pCh = guild.channels.cache.get(tData.channelId);
                            if (pCh) {
                                const mention = guild.roles.cache.find(r => r.name === tName) || '@here';
                                await pCh.send({ content: `🚨 ${mention}`, embeds: [new EmbedBuilder().setTitle('⚠️ AVISO').setDescription('Eliminación en 24h. Haced check-in.').setColor('Red')] }).catch(()=>{});
                            }
                        }
                        // Eliminación Día 7
                        if (timeDiff > MS_TO_DELETE) tribesToDelete.push(tName);
                    }

                    for (const tName of tribesToDelete) {
                        const tData = tribes[tName];
                        if (tData.channelId) guild.channels.cache.get(tData.channelId)?.delete().catch(()=>{});
                        guild.roles.cache.find(r => r.name === tName)?.delete().catch(()=>{});
                        if (checkinChannel) checkinChannel.send({ embeds: [new EmbedBuilder().setDescription(`💀 **${tName}** eliminada por inactividad.`).setColor('Red')] });
                        delete tribes[tName];
                        modified = true;
                    }
                    if (modified) { saveTribes(guild.id, tribes); await updateLog(guild, client); }
                } catch (e) { console.error(`Error tribes ${guild.id}:`, e.message); }
            }

            // --- 2. VIGILANCIA DE PAGOS (Facturación) ---
            try {
                // Buscamos el canal '🔔・alertas-pagos' (solo existe en tu server de soporte)
                const alertChannel = client.channels.cache.find(c => c.name === '🔔・alertas-pagos' && c.isTextBased());
                
                if (alertChannel) {
                    const premiumGuilds = getAllPremiumGuilds();
                    const now = Date.now();

                    for (const pg of premiumGuilds) {
                        // Si es ilimitado (1), saltar
                        if (pg.is_unlimited === 1) continue;

                        const daysActive = Math.floor((now - pg.added_at) / (24 * 60 * 60 * 1000));
                        
                        // Si ha pasado un ciclo exacto de 30 días (30, 60, 90...)
                        if (daysActive > 0 && daysActive % 30 === 0) {
                            // Comprobamos si ya avisamos hoy
                            const lastAlert = pg.last_alert || 0;
                            const oneDay = 24 * 60 * 60 * 1000;

                            if (now - lastAlert > oneDay) {
                                // ENVIAR AVISO A TI
                                await alertChannel.send({
                                    content: `<@${client.application.owner?.id || '749826568477474888'}>`, // Mención al dueño
                                    embeds: [new EmbedBuilder()
                                        .setTitle('💰 RECORDATORIO DE COBRO')
                                        .setDescription(`El cliente **${pg.client_name}** ha cumplido un ciclo de 30 días.`)
                                        .addFields(
                                            { name: '📅 Días Activo', value: `${daysActive} días`, inline: true },
                                            { name: '🆔 Servidor', value: `\`${pg.guild_id}\``, inline: true },
                                            { name: '⚙️ Acción', value: 'Verifica el pago. Si no pagó, usa `/adminlicense remove`.' }
                                        )
                                        .setColor('Gold')
                                        .setTimestamp()
                                    ]
                                });
                                
                                // Marcar como avisado
                                updateLastAlert(pg.guild_id);
                            }
                        }
                    }
                }
            } catch (e) { console.error("Error checking payments:", e); }

            isSyncing = false;
        };

        await loop();
        setInterval(loop, CHECK_INTERVAL); 
    },
};