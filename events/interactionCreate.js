const { Events, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType } = require('discord.js');
const { loadTribes, saveTribes, loadGuildConfig, isPremium } = require('../utils/dataManager');
const { updateLog } = require('../utils/logger');
const { generateVoteEmbed } = require('../commands/tribu');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        
        // ==================================================================
        // 🛡️ SISTEMA DE LICENCIAS (ANTI-PIRATERÍA)
        // ==================================================================
        if (interaction.guild) {
            const hasLicense = isPremium(interaction.guild.id);
            const commandName = interaction.commandName || '';
            
            // Lista blanca de comandos que funcionan sin licencia
            const safeCommands = ['soporte', 'botinfo', 'adminlicense']; 

            if (!hasLicense && !safeCommands.includes(commandName)) {
                try {
                    if (interaction.user.id === interaction.guild.ownerId) {
                        await interaction.reply({ 
                            content: '🔒 **LICENCIA INACTIVA**\nEste servidor no tiene una licencia activa.\nUsa `/soporte` para contactar con ventas.', 
                            ephemeral: true 
                        });
                    } else {
                        await interaction.reply({ content: '🔒 Bot en mantenimiento (Licencia inactiva).', ephemeral: true });
                    }
                } catch (e) {
                    // Si falla responder (interacción muerta), ignoramos para no crashear
                }
                return;
            }
        }

        // ==================================================================
        // 1. MANEJO DE AUTOCOMPLETADO
        // ==================================================================
        if (interaction.isAutocomplete()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.autocomplete(interaction);
            } catch (error) {
                console.error(`Error en autocomplete (${interaction.commandName}):`, error);
            }
            return;
        }

        // ==================================================================
        // 2. MANEJO DE COMANDOS DE BARRA (/)
        // ==================================================================
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`Error ejecutando comando ${interaction.commandName}:`, error);
                
                // Manejo seguro de errores (Anti-Crash 10062 / 40060)
                try {
                    const errorMsg = { content: '❌ Hubo un error al ejecutar este comando.', flags: MessageFlags.Ephemeral };
                    
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp(errorMsg);
                    } else {
                        await interaction.reply(errorMsg);
                    }
                } catch (sendError) {
                    // Si la interacción ya expiró o no se puede responder, no hacemos nada
                    // Esto evita que el bot se apague por un error de "Unknown Interaction"
                    console.log('⚠️ No se pudo enviar el mensaje de error al usuario (Interacción expirada).');
                }
            }
            return;
        }

        // ==================================================================
        // 3. MANEJO DE VOTACIÓN DE TRIBU (Select Menu)
        // ==================================================================
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('tribe_vote_')) {
            try {
                const guildId = interaction.guild.id;
                const tribeName = interaction.customId.split('_')[2]; 
                const candidateId = interaction.values[0]; 
                
                // Defer inmediato para evitar timeouts
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                let tribes = loadTribes(guildId); 
                const myTribeData = tribes[tribeName];
                
                if (!myTribeData) {
                    return interaction.followUp('❌ Error: La tribu ya no existe.');
                }

                if (!myTribeData.members.some(m => m.discordId === interaction.user.id)) {
                    return interaction.followUp('❌ No puedes votar, no eres miembro de esta tribu.');
                }
                
                // Registrar voto
                if (!myTribeData.votes) myTribeData.votes = {};
                myTribeData.votes[interaction.user.id] = candidateId; 
                
                // Calcular resultados
                const totalVotes = Object.values(myTribeData.votes).filter(id => id === candidateId).length;
                const totalMembers = myTribeData.members.length;
                const votesNeeded = Math.floor(totalMembers / 2) + 1;
                
                // Victoria (Golpe de Estado)
                if (totalVotes >= votesNeeded) {
                    // Quitar líderes antiguos
                    myTribeData.members.forEach(m => {
                        if (m.rango === 'Líder') {
                            m.rango = 'Miembro';
                            // Intentar quitar rol en Discord
                            const config = loadGuildConfig(guildId);
                            if (config && config.roles.leader) {
                                const member = interaction.guild.members.cache.get(m.discordId);
                                if (member) member.roles.remove(config.roles.leader).catch(()=>{});
                            }
                        }
                    });
                    
                    // Asignar nuevo líder
                    const winnerIdx = myTribeData.members.findIndex(m => m.discordId === candidateId);
                    if (winnerIdx !== -1) {
                        myTribeData.members[winnerIdx].rango = 'Líder';
                        const config = loadGuildConfig(guildId);
                        if (config && config.roles.leader) {
                            const member = interaction.guild.members.cache.get(candidateId);
                            if (member) member.roles.add(config.roles.leader).catch(()=>{});
                        }
                    }

                    myTribeData.votes = {}; // Reset votos
                    saveTribes(guildId, tribes);
                    
                    // Anuncio público
                    interaction.channel.send(`🚨 **¡CAMBIO DE PODER!**\n👑 **Nuevo Líder de ${tribeName}:** <@${candidateId}> (Mayoría absoluta).`).catch(()=>{});

                    // Actualizar Embed
                    const { embed, actionRow } = generateVoteEmbed(myTribeData, tribeName, interaction.client);
                    await interaction.message.edit({ embeds: [embed], components: [actionRow] });

                    return interaction.deleteReply();
                } else {
                    // Voto normal
                    saveTribes(guildId, tribes);
                    const { embed, actionRow } = generateVoteEmbed(myTribeData, tribeName, interaction.client);
                    await interaction.message.edit({ embeds: [embed], components: [actionRow] });
                    return interaction.followUp('✅ Tu voto ha sido registrado.');
                }
            } catch (error) {
                console.error('Error en votación:', error);
                try { await interaction.followUp({ content: '❌ Error al procesar el voto.', ephemeral: true }); } catch(e){}
            }
        }

        // ==================================================================
        // 4. SISTEMA DE TICKETS (Botones)
        // ==================================================================
        
        // A) Crear Ticket
        if (interaction.isButton() && interaction.customId === 'create_ticket') {
            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                const guild = interaction.guild;
                const cleanName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
                
                // Evitar duplicados
                if (guild.channels.cache.find(c => c.name === `ticket-${cleanName}`)) {
                    return interaction.followUp('❌ Ya tienes un ticket abierto.');
                }
                
                // Buscar rol Staff
                const devRole = guild.roles.cache.find(r => r.name === '👑 Desarrollador') || 
                                guild.roles.cache.find(r => r.permissions.has(PermissionFlagsBits.Administrator));
                
                // Crear canal
                const ch = await guild.channels.create({
                    name: `ticket-${cleanName}`, 
                    type: ChannelType.GuildText, 
                    parent: interaction.channel.parentId, // Se crea en la misma categoría del panel
                    permissionOverwrites: [
                        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                        { id: devRole ? devRole.id : interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                    ]
                });

                // Mensaje dentro del ticket
                const btn = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Cerrar Ticket').setStyle(ButtonStyle.Danger)
                );
                
                await ch.send({ 
                    content: `${interaction.user} | ${devRole ? devRole : 'Admin'}`, 
                    embeds: [new EmbedBuilder().setTitle('🎫 Ticket de Soporte').setDescription('Describe tu problema detalladamente. Un administrador te atenderá pronto.').setColor('Green')], 
                    components: [btn] 
                });

                return interaction.followUp(`✅ Ticket creado correctamente: ${ch}`);

            } catch (error) {
                console.error('Error creando ticket:', error);
                try { await interaction.followUp({ content: '❌ Error al crear el ticket.', ephemeral: true }); } catch(e){}
            }
        }

        // B) Cerrar Ticket
        if (interaction.isButton() && interaction.customId === 'close_ticket') {
            try {
                if (!interaction.channel.name.startsWith('ticket-')) return;
                
                await interaction.reply('🔒 Cerrando ticket en 5 segundos...');
                setTimeout(() => {
                    interaction.channel.delete().catch(() => console.log('El ticket ya fue borrado.'));
                }, 5000);
            } catch (error) {
                console.error('Error cerrando ticket:', error);
            }
        }
    },
};