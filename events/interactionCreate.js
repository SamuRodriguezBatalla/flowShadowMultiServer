const { Events, MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, ChannelType } = require('discord.js');
const { loadTribes, saveTribes, loadGuildConfig, isPremium } = require('../utils/dataManager');
const { updateLog } = require('../utils/logger');
const { generateVoteEmbed } = require('../commands/tribu');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        
        // 🛡️ SISTEMA DE LICENCIAS (ANTI-PIRATERÍA)
        if (interaction.guild) {
            const hasLicense = isPremium(interaction.guild.id);
            
            // Obtenemos el nombre del comando
            const commandName = interaction.commandName || '';
            
            // 👇 AQUÍ ESTÁ LA CORRECCIÓN IMPORTANTE 👇
            // Añadimos 'adminlicense' a la lista blanca para que NUNCA se bloquee
            const safeCommands = ['soporte', 'botinfo', 'adminlicense']; 

            if (!hasLicense && !safeCommands.includes(commandName)) {
                // Si es el dueño, le avisamos
                if (interaction.user.id === interaction.guild.ownerId) {
                    return interaction.reply({ 
                        content: '🔒 **LICENCIA INACTIVA**\nEste servidor no tiene una licencia activa.\nUsa `/soporte` para contactar con ventas.', 
                        ephemeral: true // Solo lo ve él
                    });
                } else {
                    // Si es un usuario normal, mensaje genérico
                    return interaction.reply({ content: '🔒 Bot en mantenimiento (Licencia inactiva).', ephemeral: true });
                }
            }
        }

        // 1. AUTOCOMPLETADO
        if (interaction.isAutocomplete()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (command) try { await command.autocomplete(interaction); } catch (e) { console.error(e); }
        }

        // 2. COMANDOS DE BARRA (/comando)
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (command) try { await command.execute(interaction); } 
            catch (error) { 
                console.error(error);
                const r = { content: 'Error ejecutando comando.', flags: MessageFlags.Ephemeral };
                if (interaction.replied || interaction.deferred) await interaction.followUp(r); else await interaction.reply(r);
            }
        }

        // 3. VOTACIÓN DE TRIBU
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith('tribe_vote_')) {
            const guildId = interaction.guild.id;
            const tribeName = interaction.customId.split('_')[2]; 
            const candidateId = interaction.values[0]; 
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            let tribes = loadTribes(guildId); 
            const myTribeData = tribes[tribeName];
            if (!myTribeData) return interaction.followUp('❌ Tribu no existe.');
            if (!myTribeData.members.some(m => m.discordId === interaction.user.id)) return interaction.followUp('❌ No eres miembro.');
            if (!myTribeData.votes) myTribeData.votes = {};
            myTribeData.votes[interaction.user.id] = candidateId; 
            
            const totalVotes = Object.values(myTribeData.votes).filter(id => id === candidateId).length;
            const needed = Math.floor(myTribeData.members.length / 2) + 1;
            
            if (totalVotes >= needed) {
                myTribeData.members.forEach(m => { if(m.rango==='Líder') m.rango='Miembro'; });
                const idx = myTribeData.members.findIndex(m => m.discordId === candidateId);
                if (idx !== -1) myTribeData.members[idx].rango = 'Líder';
                
                const config = loadGuildConfig(guildId);
                const leaderRole = interaction.guild.roles.cache.get(config?.roles?.leader);
                // Lógica de roles omitida por brevedad
                
                myTribeData.votes = {};
                saveTribes(guildId, tribes);
                interaction.channel.send(`🚨 **NUEVO LÍDER:** <@${candidateId}>`);
                const { embed, actionRow } = generateVoteEmbed(myTribeData, tribeName);
                await interaction.message.edit({ embeds: [embed], components: [actionRow] });
                return interaction.deleteReply();
            } else {
                saveTribes(guildId, tribes);
                const { embed, actionRow } = generateVoteEmbed(myTribeData, tribeName);
                await interaction.message.edit({ embeds: [embed], components: [actionRow] });
                return interaction.followUp('✅ Voto registrado.');
            }
        }

        // 4. CREAR TICKET
        if (interaction.isButton() && interaction.customId === 'create_ticket') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const guild = interaction.guild;
            const cleanName = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (guild.channels.cache.find(c => c.name === `ticket-${cleanName}`)) return interaction.followUp('❌ Ya tienes un ticket.');
            
            const devRole = guild.roles.cache.find(r => r.name === '👑 Desarrollador') || guild.roles.cache.find(r => r.permissions.has(PermissionFlagsBits.Administrator));
            const ch = await guild.channels.create({
                name: `ticket-${cleanName}`, type: ChannelType.GuildText, parent: interaction.channel.parentId,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel] },
                    { id: devRole ? devRole.id : interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel] }
                ]
            });
            const btn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Cerrar').setStyle(ButtonStyle.Danger));
            await ch.send({ content: `${interaction.user}`, embeds: [new EmbedBuilder().setTitle('🎫 Ticket').setDescription('Describe tu problema.').setColor('Green')], components: [btn] });
            return interaction.followUp(`✅ Ticket creado: ${ch}`);
        }

        // 5. CERRAR TICKET
        if (interaction.isButton() && interaction.customId === 'close_ticket') {
            if (!interaction.channel.name.startsWith('ticket-')) return;
            await interaction.reply('🔒 Cerrando en 5s...');
            setTimeout(() => interaction.channel.delete().catch(()=>{}), 5000);
        }
    },
};