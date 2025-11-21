const { Events, EmbedBuilder } = require('discord.js');
const { loadTribes, saveTribes, loadGuildConfig } = require('../utils/dataManager');
const { updateLog } = require('../utils/logger');
const { BAN_THRESHOLD } = require('../utils/constants');

module.exports = {
    name: Events.GuildMemberRemove,
    async execute(member) {
        const guild = member.guild;
        const config = loadGuildConfig(guild.id);
        if (!config) return;

        // 1. Limpiar registro pendiente
        const regCatId = config.categories.registration;
        if (regCatId) {
            const ch = guild.channels.cache.find(c => c.parentId === regCatId && c.name.includes(`-${member.id.slice(-4)}`));
            if (ch) await ch.delete().catch(() => {});
        }

        // 2. Detectar Estado (Ban vs Salida)
        let tribes = loadTribes(guild.id);
        let saved = false;
        let wasBanned = false;
        let tribeName = null;

        for (const tName in tribes) {
            const t = tribes[tName];
            const idx = t.members.findIndex(m => m.discordId === member.id);
            if (idx !== -1) {
                tribeName = tName;
                
                // ¿Tenía suficientes warns para considerarlo BAN?
                const totalWarns = (t.members[idx].warnings || 0) + (t.warnings || 0);
                if (totalWarns >= BAN_THRESHOLD) wasBanned = true;

                t.members.splice(idx, 1);
                saved = true;

                // Si la tribu se queda vacía
                if (t.members.length === 0) {
                    guild.roles.cache.find(r => r.name === tName)?.delete().catch(()=>{});
                    guild.channels.cache.get(t.channelId)?.delete().catch(()=>{});
                    delete tribes[tName];
                }
                break;
            }
        }

        if (saved) {
            saveTribes(guild.id, tribes);
            updateLog(guild, member.client);
        }

        // 3. ENVIAR MENSAJE AL CANAL CORRESPONDIENTE
        const byeChan = guild.channels.cache.get(config.channels.goodbye);
        const banChan = guild.channels.cache.get(config.channels.ban_notifications);
        const date = new Date().toLocaleDateString('es-ES');

        // CASO A: BANEADO (Rojo y al canal de bans)
        if (wasBanned && banChan) {
            const banEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`🚫 Expulsión Detectada`)
                .setDescription(`**${member.user.tag}** ha sido eliminado del sistema.`)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: '👤 Usuario', value: `${member.user.tag}`, inline: true },
                    { name: '🛡️ Tribu', value: tribeName || 'Ninguna', inline: true },
                    { name: '📉 Causa', value: 'Acumulación de Warns', inline: true },
                    { name: '👥 Supervivientes Restantes', value: `${guild.memberCount}`, inline: true }
                )
                .setFooter({ text: 'Sistema de Justicia Automático' });
            
            banChan.send({ embeds: [banEmbed] });
        }
        // CASO B: SALIDA VOLUNTARIA (Azul y al canal de despedidas)
        else if (byeChan) {
            const byeEmbed = new EmbedBuilder()
                .setColor('#3498DB') // Azul tranquilo
                .setTitle(`Un Superviviente ha partido...`)
                .setDescription(`**${member.user.tag}** ha decidido abandonar la isla de **${guild.name}**.`)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: '👤 Usuario', value: `${member.user.tag}`, inline: true },
                    { name: '🛡️ Antigua Tribu', value: tribeName || 'Lobo Solitario', inline: true },
                    { name: '👥 Supervivientes Restantes', value: `${guild.memberCount}`, inline: true }
                )
                .setFooter({ text: `¡Esperamos verte de nuevo, ${member.user.username}!\nSistema de Despedida Automático` })
                .setTimestamp();

            byeChan.send({ embeds: [byeEmbed] });
        }
    },
};