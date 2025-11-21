const { Events, MessageFlags, EmbedBuilder } = require('discord.js');
const { loadGuildConfig, loadTribes, saveTribes, isPremium } = require('../utils/dataManager');
const { iniciarRegistro } = require('./guildMemberAdd'); 

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot || !message.guild) return;

        // 🛡️ LICENCIA
        if (!isPremium(message.guild.id)) return;

        const guild = message.guild;
        const member = message.member;
        const config = loadGuildConfig(guild.id);

        if (config) {
            const unverifiedId = config.roles.unverified;
            
            // 1. BLOQUEO DE NO VERIFICADOS (Portero Estricto)
            if (unverifiedId && member.roles.cache.has(unverifiedId)) {
                
                // CONDICIÓN ESTRICTA: Solo permitimos hablar si el canal empieza por "registro-"
                // Ya NO permitimos hablar en toda la categoría, solo en los canales específicos.
                const isRegistrationChannel = message.channel.name.startsWith('registro-');

                if (!isRegistrationChannel) {
                    
                    // A) Borrar el mensaje intruso
                    try { await message.delete(); } catch(e){}

                    // B) Buscar si ya tiene canal (para darle el link o crearlo)
                    const normalizedName = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
                    const channelName = `registro-${normalizedName}-${member.id.slice(-4)}`;
                    
                    const privateRegCatId = config.categories.private_registration;
                    const publicRegCatId = config.categories.registration;

                    // Buscamos el canal en las categorías de registro
                    let existingChannel = guild.channels.cache.find(c => 
                        (c.parentId === privateRegCatId || c.parentId === publicRegCatId) && 
                        c.name === channelName
                    );

                    // C) AUTO-REPARACIÓN: Si no tiene canal, se lo creamos AHORA
                    if (!existingChannel) {
                        console.log(`🚑 Auto-reparando registro para ${member.user.tag}`);
                        await iniciarRegistro(member);
                        
                        // Mensaje temporal de aviso
                        const msg = await message.channel.send({ 
                            content: `⚠️ ${member}, no tenías canal de registro activo. **Te lo acabo de crear.**\nPor favor, busca el canal **#${channelName}** en la lista.` 
                        });
                        setTimeout(() => msg.delete().catch(()=>{}), 10000);
                    } else {
                        // D) Si TIENE canal, le redirigimos
                        const warningEmbed = new EmbedBuilder()
                            .setColor('Red')
                            .setTitle('⛔ Acceso Denegado')
                            .setDescription(`Hola **${member.user.username}**, debes completar tu registro antes de hablar.\n\n👉 **Ve a tu canal:** ${existingChannel}`);

                        // Intentar DM, si falla, mensaje temporal
                        try {
                            await member.send({ embeds: [warningEmbed] });
                        } catch (err) {
                            const tempMsg = await message.channel.send({ 
                                content: `${member}`, 
                                embeds: [warningEmbed.setFooter({ text: 'Borrando en 5s...' })] 
                            });
                            setTimeout(() => tempMsg.delete().catch(()=>{}), 5000);
                        }
                    }
                    return; // Cortamos ejecución para que no procese nada más
                }
            }

            // 2. CHECK-IN PASIVO
            let tribes = loadTribes(guild.id);
            let modified = false;
            let refreshedTribe = null;

            for (const tName in tribes) {
                const tribe = tribes[tName];
                if (tribe.members.some(m => m.discordId === message.author.id)) {
                    const ONE_HOUR = 3600000;
                    const now = Date.now();
                    if (now - (tribe.lastActive || 0) > ONE_HOUR) {
                        tribe.lastActive = now;
                        modified = true;
                        refreshedTribe = tName;
                    }
                    break;
                }
            }

            if (modified) {
                saveTribes(guild.id, tribes);
                if (config.channels.checkin_log) {
                    const ch = guild.channels.cache.get(config.channels.checkin_log);
                    if (ch) ch.send({ embeds: [new EmbedBuilder().setAuthor({ name: `Actividad: ${refreshedTribe}`, iconURL: message.author.displayAvatarURL() }).setDescription(`✅ **Check-in Pasivo**`).setColor('Green')] }).catch(()=>{});
                }
            }
        }
    },
};