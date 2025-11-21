const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, StringSelectMenuBuilder, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const { loadTribes, saveTribes, loadGuildConfig } = require('../utils/dataManager');
const { updateLog } = require('../utils/logger');
const { generateTribeHelpEmbed } = require('../utils/helpGenerator');

// Función auxiliar para generar el embed de votación
function generateVoteEmbed(tribeData, tribeName, interactionClient) {
    const totalMembers = tribeData.members.length;
    const votesNeeded = Math.floor(totalMembers / 2) + 1;
    const votes = tribeData.votes || {};
    const voteCounts = {};

    Object.values(votes).forEach(v => voteCounts[v] = (voteCounts[v] || 0) + 1);

    const selectOptions = [];
    let voteStatusDescription = `Miembros Totales: **${totalMembers}** | Mayoría: **${votesNeeded}**\n\n`;

    tribeData.members.forEach(m => {
        const currentVotes = voteCounts[m.discordId] || 0;
        const percentage = Math.round((currentVotes / totalMembers) * 100);
        const bar = "█".repeat(Math.floor(percentage / 10));
        
        voteStatusDescription += `${m.rango === 'Líder' ? '👑' : '👤'} **${m.username}** (${currentVotes}) [${percentage}%]\n` +
                                 `┕ **[${bar}${' '.repeat(10 - bar.length)}]**\n`;

        selectOptions.push({
            label: `${m.username} (${currentVotes})`,
            value: m.discordId,
            description: m.rango === 'Líder' ? 'Líder Actual' : 'Miembro'
        });
    });

    const embed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle(`🗳️ Elecciones: ${tribeName}`)
        .setDescription(voteStatusDescription)
        .setFooter({ text: 'Tu voto es secreto.' });

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`tribe_vote_${tribeName}`).setPlaceholder('Vota aquí...').addOptions(selectOptions)
    );

    return { embed, actionRow: row };
}

const createData = () => {
    return new SlashCommandBuilder()
        .setName('tribu')
        .setDescription('Gestión de tu tribu.')
        .addSubcommand(s => s.setName('info').setDescription('Información de tu tribu.'))
        .addSubcommand(s => s.setName('checkin').setDescription('🕒 Renueva actividad para evitar borrado.'))
        .addSubcommand(s => s.setName('votar').setDescription('Inicia votación de líder.'))
        .addSubcommand(s => s.setName('ascender').setDescription('Traspasa liderazgo.').addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)))
        .addSubcommand(s => s.setName('kick').setDescription('Expulsa miembro.').addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)))
        .addSubcommand(s => s.setName('rename').setDescription('Cambia nombre tribu.').addStringOption(o => o.setName('nuevo_nombre').setDescription('Nuevo nombre').setRequired(true)))
        .addSubcommand(s => s.setName('updatehelp').setDescription('ADMIN: Actualiza guía en canales.'));
};

module.exports = {
    createData,
    data: createData(),
    generateVoteEmbed,

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const config = loadGuildConfig(guildId);
        
        if (!config) return interaction.reply({ content: '❌ Bot no configurado.', flags: MessageFlags.Ephemeral });

        const tribes = loadTribes(guildId);
        const subcommand = interaction.options.getSubcommand();
        const executorId = interaction.user.id;
        const isServerAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        // Buscar tribu del usuario
        let myTribeName = null, myTribeData = null;
        for (const tName in tribes) {
            if (tribes[tName].members.some(m => m.discordId === executorId)) {
                myTribeName = tName;
                myTribeData = tribes[tName];
                break;
            }
        }

        // --- LÓGICA CHECK-IN CON LIMPIEZA ---
        if (subcommand === 'checkin') {
            if (!myTribeData) return interaction.reply({ content: '❌ No tienes tribu.', flags: MessageFlags.Ephemeral });
            
            const now = Date.now();
            const lastActive = myTribeData.lastActive || 0;
            const timeDiff = now - lastActive;
            
            // COOLDOWN DE 12 HORAS
            const NOTIFICATION_COOLDOWN = 12 * 60 * 60 * 1000; 

            // 1. GUARDAR ACTIVIDAD
            myTribeData.lastActive = now;
            // Guardamos provisionalmente, luego guardaremos de nuevo si hay mensaje nuevo
            saveTribes(guildId, tribes);

            // 2. GESTIÓN DEL MENSAJE PÚBLICO
            if (config.channels.checkin_log && timeDiff > NOTIFICATION_COOLDOWN) {
                const ch = interaction.guild.channels.cache.get(config.channels.checkin_log);
                if (ch) {
                    // A) BORRAR MENSAJE VIEJO (Si existe)
                    if (myTribeData.lastCheckinMsgId) {
                        try {
                            const oldMsg = await ch.messages.fetch(myTribeData.lastCheckinMsgId).catch(() => null);
                            if (oldMsg) await oldMsg.delete();
                        } catch (e) { console.log("No se pudo borrar mensaje viejo:", e.message); }
                    }

                    // B) ENVIAR MENSAJE NUEVO
                    const sentMsg = await ch.send({
                        embeds: [new EmbedBuilder()
                            .setAuthor({ name: `Check-in Manual: ${myTribeName}`, iconURL: interaction.user.displayAvatarURL() })
                            .setDescription(`✅ La tribu **${myTribeName}** ha confirmado su asistencia.\n⏰ **Hora:** <t:${Math.floor(now / 1000)}:R>`)
                            .setColor('Green')
                            .setTimestamp()
                        ]
                    }).catch(console.error);

                    // C) GUARDAR ID DEL NUEVO MENSAJE
                    if (sentMsg) {
                        myTribeData.lastCheckinMsgId = sentMsg.id;
                        saveTribes(guildId, tribes); // Guardar cambios con la ID
                    }
                }
                return interaction.reply({ content: `✅ **Check-in completado.**\n📢 Registro actualizado (Mensaje anterior eliminado).`, flags: MessageFlags.Ephemeral });
            } else {
                const hoursLeft = Math.ceil((NOTIFICATION_COOLDOWN - timeDiff) / (1000 * 60 * 60));
                return interaction.reply({ 
                    content: `✅ **Check-in completado.** Tu tribu está a salvo.\n(Sin notificación pública para evitar spam. Espera ${hoursLeft}h).`, 
                    flags: MessageFlags.Ephemeral 
                });
            }
        }

        // --- RESTO DE COMANDOS (Sin cambios) ---

        if (subcommand === 'updatehelp') {
            if (!isServerAdmin) return interaction.reply({ content: '❌ Solo admins.', flags: MessageFlags.Ephemeral });
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            let count = 0;
            const helpEmbed = generateTribeHelpEmbed();
            for (const tName in tribes) {
                const t = tribes[tName];
                if (t.channelId && t.instructionMessageId) {
                    const ch = interaction.guild.channels.cache.get(t.channelId);
                    if (ch) {
                        const msg = await ch.messages.fetch(t.instructionMessageId).catch(() => null);
                        if (msg) { await msg.edit({ embeds: [helpEmbed] }); count++; }
                    }
                }
            }
            return interaction.editReply(`✅ Guía actualizada en ${count} canales.`);
        }

        if (!myTribeData && !isServerAdmin) return interaction.reply({ content: '❌ No tienes tribu.', flags: MessageFlags.Ephemeral });

        const myMember = myTribeData ? myTribeData.members.find(m => m.discordId === executorId) : null;
        const isLeader = myMember?.rango === 'Líder';

        if (subcommand === 'info') {
            const list = myTribeData.members.map(m => `${m.rango === 'Líder' ? '👑' : '👤'} **${m.username}**`).join('\n');
            return interaction.reply({ content: `🛡️ **Tribu: ${myTribeName}**\n\n${list}` });
        }

        if (subcommand === 'votar') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const ch = interaction.guild.channels.cache.get(myTribeData.channelId);
            if (!ch) return interaction.followUp('❌ Canal de tribu no encontrado.');
            
            const { embed, actionRow } = generateVoteEmbed(myTribeData, myTribeName);
            await ch.send({ content: `🗳️ **Votación iniciada por ${interaction.user}**`, embeds: [embed], components: [actionRow] });
            saveTribes(guildId, tribes);
            return interaction.followUp('✅ Votación lanzada en vuestro canal.');
        }

        if (['ascender', 'kick'].includes(subcommand)) {
            if (!isLeader && !isServerAdmin) return interaction.reply({ content: '❌ Solo el Líder puede hacer esto.', flags: MessageFlags.Ephemeral });
            
            const targetUser = interaction.options.getUser('usuario');
            const targetIdx = myTribeData.members.findIndex(m => m.discordId === targetUser.id);
            if (targetIdx === -1) return interaction.reply({ content: '❌ Ese usuario no está en tu tribu.', flags: MessageFlags.Ephemeral });

            const leaderRole = interaction.guild.roles.cache.get(config.roles.leader);

            if (subcommand === 'ascender') {
                myTribeData.members.forEach(m => {
                    if (m.rango === 'Líder') {
                        m.rango = 'Miembro';
                        const old = interaction.guild.members.cache.get(m.discordId);
                        if (old && leaderRole) old.roles.remove(leaderRole).catch(() => {});
                    }
                });
                myTribeData.members[targetIdx].rango = 'Líder';
                const nev = interaction.guild.members.cache.get(targetUser.id);
                if (nev && leaderRole) nev.roles.add(leaderRole).catch(() => {});
                
                saveTribes(guildId, tribes);
                await updateLog(interaction.guild, interaction.client);
                return interaction.reply(`👑 **${targetUser}** es el nuevo Líder de **${myTribeName}**.`);
            }

            if (subcommand === 'kick') {
                if (targetUser.id === executorId) return interaction.reply({ content: '❌ No te puedes expulsar a ti mismo.', flags: MessageFlags.Ephemeral });
                const mem = interaction.guild.members.cache.get(targetUser.id);
                if (mem) {
                    const tRole = interaction.guild.roles.cache.find(r => r.name === myTribeName);
                    if (tRole) await mem.roles.remove(tRole).catch(() => {});
                    if (leaderRole) await mem.roles.remove(leaderRole).catch(() => {});
                    const unverified = interaction.guild.roles.cache.get(config.roles.unverified);
                    if (unverified) await mem.roles.add(unverified).catch(() => {});
                }
                myTribeData.members.splice(targetIdx, 1);
                saveTribes(guildId, tribes);
                await updateLog(interaction.guild, interaction.client);
                return interaction.reply(`👢 **${targetUser.tag}** expulsado.`);
            }
        }
        
        if (subcommand === 'rename') {
            if (!isLeader && !isServerAdmin) return interaction.reply({ content: '❌ Solo el Líder.', flags: MessageFlags.Ephemeral });
            await interaction.deferReply();
            const newName = interaction.options.getString('nuevo_nombre');
            if (tribes[newName]) return interaction.followUp('❌ Nombre ocupado.');

            const oldName = myTribeName;
            const role = interaction.guild.roles.cache.find(r => r.name === oldName);
            const ch = interaction.guild.channels.cache.get(myTribeData.channelId);

            if (role) await role.setName(newName).catch(console.error);
            if (ch) await ch.setName(newName).catch(console.error);

            tribes[newName] = myTribeData;
            delete tribes[oldName];
            saveTribes(guildId, tribes);
            await updateLog(interaction.guild, interaction.client);
            
            return interaction.followUp(`✅ Tribu renombrada a **${newName}**.`);
        }
    },
};