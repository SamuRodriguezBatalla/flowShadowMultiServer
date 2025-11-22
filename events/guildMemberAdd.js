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

    // --- BLOQUEO DE ADMINISTRADORES (Seguridad) ---
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        // console.log(`🛡️ Omitiendo registro para admin: ${member.user.tag}`);
        return; 
    }

    // Evitar ejecuciones duplicadas
    if (processingMembers.has(member.id)) return;
    processingMembers.add(member.id);
    setTimeout(() => processingMembers.delete(member.id), 15000);

    try {
        const guild = member.guild;
        let config = loadGuildConfig(guild.id);
        
        if (!config) return; // Sin config no hacemos nada

        const unverifiedRole = guild.roles.cache.get(config.roles.unverified);
        const survivorRole = guild.roles.cache.get(config.roles.survivor);
        
        // 1. Asegurar Rol (Si no lo tiene se lo ponemos)
        if (unverifiedRole && !member.roles.cache.has(unverifiedRole.id)) {
            await member.roles.add(unverifiedRole).catch(()=>{});
        }

        // 2. BUSCAR/LIMPIAR CANAL VIEJO
        const suffix = member.id.slice(-4);
        const oldCh = guild.channels.cache.find(c => {
            if (c.type !== ChannelType.GuildText) return false;
            return (c.topic && c.topic.includes(member.id)) || (c.name.includes(suffix) && c.name.includes('registro'));
        });
        
        if (oldCh) {
            console.log(`ℹ️ El usuario ${member.user.tag} ya tiene canal: ${oldCh.name}`);
            return; 
        }

        // 3. OBTENER LA CATEGORÍA PRIVADA (CORRECCIÓN TIPOGRÁFICA)
        let catId = config.categories.private_registration;
        let catObj = guild.channels.cache.get(catId);

        if (!catObj) {
            console.log(`🛠️ [Registro] Categoría Privada no encontrada. Reparando...`);
            
            // Buscar por nombre si el ID falló (Usando el nombre correcto)
            catObj = guild.channels.cache.find(c => c.name === '🔐 Rᴇgistrᴏ-Pʀiᴠᴀdᴏ' && c.type === ChannelType.GuildCategory);
            
            if (!catObj) {
                // Crear si no existe (Usando el nombre correcto)
                const newCat = await guild.channels.create({
                    name: '🔐 Rᴇgistrᴏ-Pʀiᴠᴀdᴏ',
                    type: ChannelType.GuildCategory,
                    position: 0,
                    permissionOverwrites: [{ id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }]
                });
                config.categories.private_registration = newCat.id;
                saveGuildConfig(guild.id, config);
                catObj = newCat;
                catId = newCat.id;
            } else {
                 // Si la encontró por nombre, pero la config estaba mal, la actualizamos
                config.categories.private_registration = catObj.id;
                saveGuildConfig(guild.id, config);
                catId = catObj.id;
            }
        }

        // 4. CREAR EL CANAL
        const cleanName = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
        const channel = await guild.channels.create({
            name: `registro-${cleanName}-${suffix}`,
            type: ChannelType.GuildText,
            parent: catId, 
            topic: `USER_ID:${member.id} | TYPE:REGISTRO`, 
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: member.client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
            ]
        });

        console.log(`✅ Canal creado para ${member.user.tag}`);

        // 5. MENSAJE DE BIENVENIDA Y FLUJO
        const season = config.season || 0;
        await channel.send(`👋 Hola ${member}. Bienvenido a la **Season ${season} de ${guild.name}**.\nEscribe tu **ID de PlayStation** para comenzar.`);

        const idMsg = await recibirRespuesta(member, channel);
        if (!idMsg) return; 
        const idPlay = idMsg.content;

        await channel.send(`✅ Guardado. Ahora dime el **nombre de tu Tribu**.`);
        const tMsg = await recibirRespuesta(member, channel);
        if (!tMsg) return;
        const tName = tMsg.content.trim();

        // Lógica de Tribu (Existente o Nueva)
        let tribes = loadTribes(guild.id);
        if (tribes[tName]) {
            await channel.send(`La tribu **${tName}** ya existe. ¿Te unes a ella? (si/no)`);
            const conf = await recibirRespuesta(member, channel);
            if (!conf || !['si','yes','s'].includes(conf.content.toLowerCase())) return channel.send('Cancelado. Nombre ocupado.');
        }

        let tRole = guild.roles.cache.find(r => r.name === tName);
        let tData = tribes[tName];

        if (!tData) {
            if (!tRole) tRole = await guild.roles.create({ name: tName, color: 'Random', reason: 'Registro BotArk' });
            
            let tCatId = config.categories.tribes;
            if (!guild.channels.cache.get(tCatId)) {
                // Reparar categoría tribus si falta
                const tc = await guild.channels.create({ name: 'Tʀiʙuѕ', type: ChannelType.GuildCategory, position: 2 });
                config.categories.tribes = tc.id;
                saveGuildConfig(guild.id, config);
                tCatId = tc.id;
            }

            const tChan = await guild.channels.create({
                name: tName, type: ChannelType.GuildText, parent: tCatId,
                permissionOverwrites: [
                    { id: guild.id, deny: [1024n] }, 
                    { id: tRole.id, allow: [1024n, 2048n] },
                    { id: member.client.user.id, allow: [1024n] }
                ]
            });

            const help = generateTribeHelpEmbed();
            const hMsg = await tChan.send({ embeds: [help] });
            tData = { members: [], warnings: 0, channelId: tChan.id, instructionMessageId: hMsg.id, lastActive: Date.now() };
            tribes[tName] = tData;
            await channel.send(`✅ Tribu **${tName}** creada.`);
        } else {
            if (!tRole) tRole = await guild.roles.cache.find(r => r.name === tName);
        }

        // 6. ASIGNACIÓN DE ROLES FINALES
        const rank = tData.members.length === 0 ? 'Líder' : 'Miembro';
        
        if (tRole) await member.roles.add(tRole).catch(()=>{});
        if (survivorRole) await member.roles.add(survivorRole).catch(()=>{});
        if (unverifiedRole) await member.roles.remove(unverifiedRole).catch(()=>{});
        
        if (rank === 'Líder') {
            const lRole = guild.roles.cache.get(config.roles.leader);
            if (lRole) await member.roles.add(lRole).catch(()=>{});
        }

        // 7. GUARDAR DATOS Y LOGS
        tData.members.push({ username: member.user.username, idPlay: idPlay, discordId: member.id, hasKit: false, warnings: 0, rango: rank });
        saveTribes(guild.id, tribes);
        await updateLog(guild, member.client);

        const welcomeChan = guild.channels.cache.get(config.channels.welcome);
        if (welcomeChan) {
            const wEmbed = new EmbedBuilder()
                .setColor('#8c00ff').setTitle(`¡Bienvenido a la Season ${season}!`).setDescription(`${member} se ha unido.`)
                .addFields(
                    { name: '🎮 ID PlayStation', value: `\`${idPlay}\``, inline: true },
                    { name: '🛡️ Tribu', value: `**${tName}**`, inline: true },
                    { name: '👥 Estado', value: `Superviviente #${guild.memberCount}`, inline: true }
                )
                .setTimestamp();
            welcomeChan.send({ embeds: [wEmbed] }).catch(()=>{});
        }

        // 8. CIERRE DEL CANAL
        setTimeout(() => channel.delete().catch(()=>{}), 5000);

    } catch (e) {
        console.error(`Error registro ${member.user.tag}:`, e);
    } finally {
        processingMembers.delete(member.id);
    }
}

function recibirRespuesta(member, channel) {
    return new Promise(r => {
        const col = channel.createMessageCollector({ filter: msg => msg.author.id === member.id, max: 1, time: 300000 });
        col.on('collect', msg => r(msg));
        col.on('end', (co, re) => { if (re !== 'limit') r(null); });
    });
}