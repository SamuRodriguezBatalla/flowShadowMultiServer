const { Events, PermissionsBitField, EmbedBuilder, ChannelType } = require('discord.js');
const { loadTribes, saveTribes, loadGuildConfig, saveGuildConfig } = require('../utils/dataManager');
const { updateLog } = require('../utils/logger');
const { generateTribeHelpEmbed } = require('../utils/helpGenerator');

const processingMembers = new Set();

module.exports = {
    name: Events.GuildMemberAdd,
    execute: async (member) => await iniciarRegistro(member),
    iniciarRegistro 
};

async function iniciarRegistro(member) {
    if (member.user.bot) return;
    if (processingMembers.has(member.id)) return;
    processingMembers.add(member.id);
    setTimeout(() => processingMembers.delete(member.id), 10000);

    try {
        const guild = member.guild;
        let config = loadGuildConfig(guild.id);
        if (!config) return;

        const unverifiedRole = guild.roles.cache.get(config.roles.unverified);
        const survivorRole = guild.roles.cache.get(config.roles.survivor);
        if (!unverifiedRole || !survivorRole) return;

        if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

        // 1. Asegurar Rol No Verificado
        if (!member.roles.cache.has(unverifiedRole.id)) {
            await member.roles.add(unverifiedRole).catch(()=>{});
        }

        // 2. Limpieza de canales anteriores (Búsqueda híbrida)
        const suffix = member.id.slice(-4);
        const oldCh = guild.channels.cache.find(c => {
            if (c.type !== ChannelType.GuildText) return false;
            const isMyTopic = c.topic && c.topic.includes(`USER:${member.id}`);
            const isMyName = c.name.includes(`-${suffix}`) && c.name.startsWith('registro-');
            return isMyTopic || isMyName;
        });
        if (oldCh) await oldCh.delete('Reinicio de registro').catch(()=>{});

        // 3. Reparación de Categoría
        let catId = config.categories.private_registration || config.categories.registration;
        if (!guild.channels.cache.get(catId)) {
            // Si la categoría no existe, crearla y guardar
            const newCat = await guild.channels.create({
                name: '🔐 Rᴇɢɪsᴛʀᴏ-Pʀɪᴠᴀᴅᴏ',
                type: ChannelType.GuildCategory,
                permissionOverwrites: [{ id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }]
            });
            config.categories.private_registration = newCat.id;
            saveGuildConfig(guild.id, config);
            catId = newCat.id;
        }

        // 4. Crear Canal
        const cleanName = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
        const chName = `registro-${cleanName}-${suffix}`;
        const channelTopic = `USER:${member.id} | SYSTEM:REGISTRO | NO BORRAR MANUALMENTE`;

        const channel = await guild.channels.create({
            name: chName,
            type: ChannelType.GuildText,
            parent: catId,
            topic: channelTopic,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: member.client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ]
        });

        // 5. Inicio del Registro
        const season = config.season !== undefined ? config.season : 0;
        await channel.send(`👋 Hola ${member}. Bienvenido a la **Season ${season}** de **${guild.name}**.\nPor favor, indica tu **ID de PlayStation**.`);
        
        const idMsg = await recibirRespuesta(member, channel);
        if (!idMsg) return; 
        const idPlay = idMsg.content;

        await channel.send(`Perfecto. Ahora dime el **nombre de tu Tribu**.`);
        const tMsg = await recibirRespuesta(member, channel);
        if (!tMsg) return;
        const tName = tMsg.content.trim();

        // Lógica de Tribus
        let tribes = loadTribes(guild.id);
        if (tribes[tName]) {
            await channel.send(`La tribu **${tName}** existe. ¿Te unes? (si)`);
            const conf = await recibirRespuesta(member, channel);
            if (!conf || !['si','yes','s','sí'].includes(conf.content.toLowerCase())) return channel.send('Cancelado.');
        }

        let tRole = guild.roles.cache.find(r => r.name === tName);
        let tData = tribes[tName];

        if (!tData) {
            if (!tRole) tRole = await guild.roles.create({ name: tName, color: 'Random' });
            
            // Reparar categoría tribus si falta
            let tCatId = config.categories.tribes;
            if (!guild.channels.cache.get(tCatId)) {
                const newTCat = await guild.channels.create({ name: 'Tʀɪʙᴜs', type: ChannelType.GuildCategory });
                config.categories.tribes = newTCat.id;
                saveGuildConfig(guild.id, config);
                tCatId = newTCat.id;
            }

            const tChan = await guild.channels.create({
                name: tName, type: ChannelType.GuildText, parent: tCatId,
                permissionOverwrites: [{ id: guild.id, deny: [1024n] }, { id: tRole.id, allow: [1024n] }, { id: member.client.user.id, allow: [1024n] }]
            });
            const helpEmbed = generateTribeHelpEmbed();
            const hMsg = await tChan.send({ embeds: [helpEmbed] });
            tData = { members: [], warnings: 0, channelId: tChan.id, instructionMessageId: hMsg.id, lastActive: Date.now() };
            tribes[tName] = tData;
            await channel.send(`✅ Tribu **${tName}** creada.`);
        } else {
            if (!tRole) tRole = await guild.roles.cache.find(r => r.name === tName);
        }

        // Finalizar y Asignar Roles
        const rank = tData.members.length === 0 ? 'Líder' : 'Miembro';
        
        if (tRole) await member.roles.add(tRole).catch(()=>{});
        await member.roles.add(survivorRole).catch(()=>{});
        await member.roles.remove(unverifiedRole).catch(()=>{}); // Quitar Rol No Verificado

        if (rank === 'Líder') {
            const lRole = guild.roles.cache.get(config.roles.leader);
            if (lRole) await member.roles.add(lRole).catch(()=>{});
        }

        // Guardar
        tData.members.push({ username: member.user.username, idPlay, discordId: member.id, hasKit: false, warnings: 0, rango: rank });
        saveTribes(guild.id, tribes);
        await updateLog(guild, member.client);

        // ============================================================
        // 📢 MENSAJE DE BIENVENIDA PÚBLICO (TU CÓDIGO SOLICITADO)
        // ============================================================
        const welcomeChan = guild.channels.cache.get(config.channels.welcome);
        if (welcomeChan) {
            const welcomeEmbed = new EmbedBuilder()
                .setColor('#7700ff') 
                .setTitle(`Bienvenido a la Season ${season} de ${guild.name}`)
                .setDescription(`¡Demos una cálida bienvenida a ${member} al servidor!`)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: '🎮 ID PlayStation', value: `\`${idPlay}\``, inline: true },
                    { name: '🛡️ Tribu', value: `**${tName}**`, inline: true },
                    { name: '👥 Miembros', value: `${guild.memberCount} Supervivientes`, inline: true },
                    { name: '📅 Fecha', value: new Date().toLocaleDateString('es-ES'), inline: false }
                )
                .setFooter({ text: 'FlowShadow - Registro Automático', iconURL: member.client.user.displayAvatarURL() })
                .setTimestamp();

            welcomeChan.send({ embeds: [welcomeEmbed] }).catch(() => {});
        }

        // Borrar canal de registro
        setTimeout(() => channel.delete().catch(()=>{}), 5000);

    } catch (e) { console.error(e); } finally { processingMembers.delete(member.id); }
}

function recibirRespuesta(m, c) {
    return new Promise(r => {
        const col = c.createMessageCollector({ filter: msg => msg.author.id === m.id, max: 1, time: 300000 });
        col.on('collect', msg => r(msg));
        col.on('end', (co, re) => { if (re !== 'limit') r(null); });
    });
}