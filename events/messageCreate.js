const { Events, MessageFlags, EmbedBuilder, ChannelType } = require('discord.js');
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
        
        // Si el miembro no está cacheado, salimos para evitar errores
        if (!member) return;

        const config = loadGuildConfig(guild.id);

        if (config) {
            const unverifiedId = config.roles.unverified;
            
            // ==================================================================
            // 1. BLOQUEO DE NO VERIFICADOS (Portero Inteligente)
            // ==================================================================
            if (unverifiedId && member.roles.cache.has(unverifiedId)) {
                
                // EXCEPCIÓN 1: ¿Es un canal de registro por NOMBRE?
                if (message.channel.name.startsWith('registro-')) return; // DEJAR HABLAR

                // EXCEPCIÓN 2: ¿Es un canal de registro por ETIQUETA (Topic)?
                if (message.channel.topic && message.channel.topic.includes('SYSTEM:REGISTRO')) return; // DEJAR HABLAR

                // EXCEPCIÓN 3: ¿Es un canal dentro de la categoría privada?
                const privCat = config.categories.private_registration;
                if (privCat && message.channel.parentId === privCat) return; // DEJAR HABLAR

                // --- SI LLEGA AQUÍ, ESTÁ HABLANDO DONDE NO DEBE ---
                
                // A) Borrar mensaje
                try { await message.delete(); } catch(e){}

                // B) Comprobar si YA tiene canal (para no crear otro a lo tonto)
                const suffix = member.id.slice(-4);
                const existingChannel = guild.channels.cache.find(c => 
                    c.type === ChannelType.GuildText && 
                    (c.name.includes(`-${suffix}`) && c.name.startsWith('registro-')) ||
                    (c.topic && c.topic.includes(`USER:${member.id}`))
                );

                // C) Redirigir o Reparar
                if (!existingChannel) {
                    // Solo si NO tiene canal, le creamos uno
                    console.log(`🚑 Auto-reparando registro para ${member.user.tag} (Intento hablar en general)`);
                    await iniciarRegistro(member);
                } else {
                    // Si ya tiene canal, le avisamos
                    const warningEmbed = new EmbedBuilder()
                        .setColor('Red')
                        .setTitle('⛔ Acceso Denegado')
                        .setDescription(`Hola **${member.user.username}**, aún no estás verificado.\n\n👉 **Ve a tu canal:** ${existingChannel}`);

                    try {
                        await member.send({ embeds: [warningEmbed] });
                    } catch (err) {
                        const tempMsg = await message.channel.send({ 
                            content: `${member}`, 
                            embeds: [warningEmbed.setFooter({ text: 'Este mensaje se autodestruirá.' })] 
                        });
                        setTimeout(() => tempMsg.delete().catch(()=>{}), 5000);
                    }
                }
                return; 
            }

            // 2. CHECK-IN PASIVO (Solo para verificados)
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