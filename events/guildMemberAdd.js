const { Events, PermissionsBitField, EmbedBuilder, ChannelType } = require('discord.js');
const { loadTribes, saveTribes, loadGuildConfig } = require('../utils/dataManager');
const { updateLog } = require('../utils/logger');
const { generateTribeHelpEmbed } = require('../utils/helpGenerator');

// 🚦 SEMÁFORO ANTI-DUPLICADOS
const processingMembers = new Set();

module.exports = {
    name: Events.GuildMemberAdd,
    execute: async (member) => await iniciarRegistro(member),
    iniciarRegistro 
};

async function iniciarRegistro(member) {
    if (member.user.bot) return;

    // 🔒 BLOQUEO
    if (processingMembers.has(member.id)) {
        console.log(`🚫 Registro duplicado evitado para ${member.user.tag}`);
        return;
    }
    processingMembers.add(member.id);
    setTimeout(() => { processingMembers.delete(member.id); }, 10000);

    try {
        const guild = member.guild;
        const client = member.client;

        // 1. Cargar Configuración
        const config = loadGuildConfig(guild.id);
        if (!config) return console.log(`⚠️ Bot no configurado en ${guild.name}`);

        // Roles
        const unverifiedRole = guild.roles.cache.get(config.roles.unverified);
        const survivorRole = guild.roles.cache.get(config.roles.survivor);
        
        if (!unverifiedRole || !survivorRole) return;

        // ===========================================================
        // 🧹 LIMPIEZA DE FANTASMAS (NUEVO) 🧹
        // Si el usuario ya existía en alguna tribu (datos viejos), lo borramos.
        // ===========================================================
        let tribes = loadTribes(guild.id);
        let wasGhost = false;

        for (const tName in tribes) {
            const t = tribes[tName];
            // Buscamos si el usuario está en esta tribu
            const idx = t.members.findIndex(m => m.discordId === member.id);
            
            if (idx !== -1) {
                console.log(`👻 Datos fantasma detectados para ${member.user.tag} en tribu ${tName}. Limpiando...`);
                t.members.splice(idx, 1); // Lo borramos
                wasGhost = true;

                // Si la tribu se queda vacía por esto, la borramos también
                if (t.members.length === 0) {
                    const role = guild.roles.cache.find(r => r.name === tName);
                    if (role) role.delete('Limpieza Fantasma').catch(() => {});
                    const ch = guild.channels.cache.get(t.channelId);
                    if (ch) ch.delete().catch(() => {});
                    delete tribes[tName];
                }
            }
        }

        // Si encontramos basura vieja, guardamos la limpieza
        if (wasGhost) {
            saveTribes(guild.id, tribes);
            // Recargamos tribes para seguir con el proceso limpio
            tribes = loadTribes(guild.id); 
        }
        // ===========================================================

        // Filtro Admin
        const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator) || member.roles.cache.some(r => r.name === 'ADMIN');
        if (isAdmin) return;

        await member.roles.add(unverifiedRole).catch(() => {});

        // 2. Canal de Registro Privado
        const privateRegCatId = config.categories.private_registration || config.categories.registration;
        const normalizedName = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
        const channelName = `registro-${normalizedName}-${member.id.slice(-4)}`;

        // DOBLE CHEQUEO
        const existingChannel = guild.channels.cache.find(c => c.parentId === privateRegCatId && c.name === channelName);
        if (existingChannel) return; 

        const channel = await guild.channels.create({
            name: channelName, 
            type: ChannelType.GuildText,
            parent: privateRegCatId,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            ],
        });

        const season = config.season || 0;

        // --- FLUJO DE PREGUNTAS ---
        await channel.send(`¡Hola ${member}! 👋\nBienvenido a la **Season ${season}**. Para registrarte necesito tu **ID de PlayStation**.`);
        const idMsg = await recibirRespuesta(member, channel);
        if (!idMsg) return;
        const idPlay = idMsg.content;

        await channel.send(`Perfecto. Ahora dime el **nombre de tu Tribu**.`);
        let tribeMsg = await recibirRespuesta(member, channel);
        if (!tribeMsg) return;
        let tribeName = tribeMsg.content.trim();

        // Recargamos tribes por si hubo cambios durante la espera
        tribes = loadTribes(guild.id);

        if (tribes[tribeName]) {
            await channel.send(`La tribu **${tribeName}** ya existe. ¿Te unes a ella? (sí/no)`);
            const confirm = await recibirRespuesta(member, channel);
            if (!confirm || !['si', 'sí', 'yes'].includes(confirm.content.toLowerCase())) {
                await channel.send("Registro cancelado. Elige otro nombre reiniciando el proceso.");
                setTimeout(() => channel.delete().catch(()=>{}), 5000);
                return;
            }
        }

        // 3. CREACIÓN DE TRIBU
        let tribeRole = guild.roles.cache.find(r => r.name === tribeName);

        if (!tribes[tribeName]) {
            if (!tribeRole) tribeRole = await guild.roles.create({ name: tribeName, color: 'Random' });

            const tribeCategoryId = config.categories.tribes;
            const tribeChannel = await guild.channels.create({
                name: tribeName,
                type: ChannelType.GuildText,
                parent: tribeCategoryId,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: tribeRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
                ]
            });

            const helpEmbed = generateTribeHelpEmbed();
            helpEmbed.setDescription(`⛺ **Base de ${tribeName}**\n⚠️ Usad \`/tribu checkin\` semanalmente.\n\n` + (helpEmbed.data.description || ''));
            await tribeChannel.send({ embeds: [helpEmbed] });

            tribes[tribeName] = {
                members: [], warnings: 0, channelId: tribeChannel.id,
                instructionMessageId: null, lastActive: Date.now()
            };
            saveTribes(guild.id, tribes);
            await channel.send(`Creando tribu **${tribeName}**...`);
        } else {
            if (!tribeRole) tribeRole = await guild.roles.cache.find(r => r.name === tribeName);
        }

        // 4. FINALIZAR Y DAR ROLES
        const isFirst = tribes[tribeName].members.length === 0;
        const rank = isFirst ? 'Líder' : 'Miembro';

        await member.roles.add(tribeRole).catch(() => {});
        await member.roles.remove(unverifiedRole).catch(() => {});
        await member.roles.add(survivorRole).catch(() => {});

        if (isFirst) {
            const leaderRole = guild.roles.cache.get(config.roles.leader);
            if (leaderRole) await member.roles.add(leaderRole).catch(() => {});
        }

        // Volvemos a cargar y guardar para asegurar consistencia
        tribes = loadTribes(guild.id);
        tribes[tribeName].members.push({
            username: member.user.username, idPlay: idPlay, discordId: member.id,
            hasKit: false, warnings: 0, rango: rank
        });
        saveTribes(guild.id, tribes);
        
        await updateLog(guild, client);

        // 5. MENSAJE DE BIENVENIDA PÚBLICO
        const welcomeChan = guild.channels.cache.get(config.channels.welcome);
        if (welcomeChan) {
            const date = new Date().toLocaleDateString('es-ES');
            const welcomeEmbed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setTitle(`Bienvenido a la Season ${season} de ${guild.name}`)
                .setDescription(`¡Demos una cálida bienvenida a ${member} al servidor!`)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                .addFields(
                    { name: '🎮 ID PlayStation', value: `\`${idPlay}\``, inline: true },
                    { name: '🛡️ Tribu', value: `**${tribeName}**`, inline: true },
                    { name: '👥 Miembros', value: `${guild.memberCount} Supervivientes`, inline: true },
                    { name: '📅 Fecha', value: date, inline: false }
                )
                .setFooter({ text: `${guild.name} - Registro Automático`, iconURL: guild.iconURL() });

            welcomeChan.send({ embeds: [welcomeEmbed] });
        }

        setTimeout(() => channel.delete().catch(() => {}), 5000);

    } catch (error) {
        console.error("Error en registro:", error);
        processingMembers.delete(member.id);
    }
}

function recibirRespuesta(member, channel) {
    return new Promise(resolve => {
        const collector = channel.createMessageCollector({ filter: m => m.author.id === member.id, max: 1 });
        collector.on("collect", msg => resolve(msg));
        collector.on("end", (c, r) => resolve(null));
    });
}