const { Events, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType } = require('discord.js');
const { loadTribes, saveTribes, loadGuildConfig, isPremium } = require('../utils/dataManager');
const { updateLog } = require('../utils/logger');
const { generateVoteEmbed } = require('../commands/tribu');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        
        // Inicializar el Map de votos si no existe (Para el nuevo sistema /suggestvote)
        if (!interaction.client.suggestVotes) {
             interaction.client.suggestVotes = new Map();
        }
        
        // ==================================================================
        // 🛡️ SISTEMA DE LICENCIAS (ANTI-PIRATERÍA)
        // ==================================================================
        if (interaction.guild) {
            const hasLicense = isPremium(interaction.guild.id);
            const commandName = interaction.commandName || '';
            
            // Lista blanca de comandos que funcionan sin licencia
            const safeCommands = ['soporte', 'botinfo', 'adminlicense', 'syncchannels']; 

            if (!hasLicense && !safeCommands.includes(commandName)) {
                try {
                    // Nota: Asumimos que TU_ID_AQUI fue reemplazado en el contexto anterior.
                    const MY_ID = 'TU_ID_AQUI'; // Reemplaza con tu ID para el bypass
                    const isOwner = interaction.user.id === MY_ID || interaction.user.id === interaction.guild.ownerId;

                    if (isOwner) {
                        await interaction.reply({ 
                            content: '🔒 **LICENCIA INACTIVA**\nEste servidor no tiene una licencia activa.\nUsa `/soporte` para contactar con ventas.', 
                            ephemeral: true 
                        });
                    } else {
                        await interaction.reply({ content: '🔒 Bot en mantenimiento (Licencia inactiva).', ephemeral: true });
                    }
                } catch (e) {
                    // Si falla responder (interacción muerta), ignoramos
                }
                return;
            }
        }

        // ==================================================================
        // 1. MANEJO DE AUTOCOMPLETADO Y COMANDOS DE BARRA (/)
        // ==================================================================
        if (interaction.isAutocomplete()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) return;
            try { await command.autocomplete(interaction); } catch (error) { console.error(`Error en autocomplete:`, error); }
            return;
        }

        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`Error ejecutando comando ${interaction.commandName}:`, error);
                const errorMsg = { content: '❌ Hubo un error al ejecutar este comando.', flags: MessageFlags.Ephemeral };
                try {
                    if (interaction.replied || interaction.deferred) { await interaction.followUp(errorMsg); } 
                    else { await interaction.reply(errorMsg); }
                } catch (sendError) {}
            }
            return;
        }

        // ==================================================================
        // 2. MANEJO DE VOTACIÓN DE SUGERENCIA (Botones 'suggest_vote_')
        // ==================================================================
        if (interaction.isButton() && interaction.customId.startsWith('suggest_vote_')) {
            const voteId = `${interaction.guild.id}:${interaction.message.id}`;
            const voteData = interaction.client.suggestVotes?.get(voteId);
            
            if (!voteData) {
                return interaction.reply({ content: '❌ Esta votación ha finalizado o ha expirado.', ephemeral: true });
            }

            const userId = interaction.user.id;
            
            if (voteData.voters.has(userId)) {
                return interaction.reply({ content: '❌ Ya has votado en esta sugerencia.', ephemeral: true });
            }
            
            await interaction.deferUpdate();

            const isYes = interaction.customId === 'suggest_vote_yes';
            
            // Registrar voto y votante
            if (isYes) {
                voteData.yes++;
            } else {
                voteData.no++;
            }
            voteData.voters.add(userId);
            
            // Actualizar Embed
            const totalVotes = voteData.yes + voteData.no;
            const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setFields(
                    interaction.message.embeds[0].fields[0], 
                    interaction.message.embeds[0].fields[1], 
                    { name: '📊 Resultados', value: `Sí: ${voteData.yes} | No: ${voteData.no} (Total: ${totalVotes})`, inline: false }
                );
                
            await interaction.message.edit({ embeds: [updatedEmbed] }).catch(console.error);

            // Guardar estado actualizado en el mapa global
            interaction.client.suggestVotes.set(voteId, voteData);
        }


        // ==================================================================
        // 3. MANEJO DE VOTACIÓN DE TRIBU (Select Menu)
        // ==================================================================
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('tribe_vote_')) {
            try {
                const guildId = interaction.guild.id;
                const tribeName = interaction.customId.split('_')[2]; 
                const candidateId = interaction.values[0]; 
                
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                let tribes = loadTribes(guildId); 
                const myTribeData = tribes[tribeName];
                
                if (!myTribeData) return interaction.followUp('❌ Error: La tribu ya no existe.');
                if (!myTribeData.members.some(m => m.discordId === interaction.user.id)) return interaction.followUp('❌ No puedes votar, no eres miembro de esta tribu.');
                
                // Registrar voto
                if (!myTribeData.votes) myTribeData.votes = {};
                myTribeData.votes[interaction.user.id] = candidateId; 
                
                // Calcular resultados y chequear victoria
                const totalVotes = Object.values(myTribeData.votes).filter(id => id === candidateId).length;
                const totalMembers = myTribeData.members.length;
                const votesNeeded = Math.floor(totalMembers / 2) + 1;
                
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
                    
                    interaction.channel.send(`🚨 **¡CAMBIO DE PODER!**\n👑 **Nuevo Líder de ${tribeName}:** <@${candidateId}> (Mayoría absoluta).`).catch(()=>{});
                    const { embed, actionRow } = generateVoteEmbed(myTribeData, tribeName, interaction.client);
                    await interaction.message.edit({ embeds: [embed], components: [actionRow] });

                    return interaction.deleteReply();
                } else {
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