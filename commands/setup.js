const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { saveGuildConfig, loadGuildConfig } = require('../utils/dataManager');

const SUPPORT_INVITE_LINK = 'https://discord.gg/pBPRS64GKq'; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('⚙️ Inicializa y ORDENA ESTRATÉGICAMENTE el servidor.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        try { await interaction.deferReply(); } catch (e) { return; }

        const guild = interaction.guild;
        let config = loadGuildConfig(guild.id) || { roles: {}, channels: {}, categories: {} };

        const DEFAULTS = {
            roles: { survivor: 'Superviviente', unverified: 'No verificado', leader: 'Líder de Tribu' },
            categories: { 
                private_register: '🔐 Rᴇɢɪsᴛʀᴏ-Pʀɪᴠᴀᴅᴏ', 
                register: '📝 Zᴏɴᴀ ᴅᴇ Rᴇɢɪsᴛʀᴏ', 
                tribes: 'Tʀɪʙᴜs' 
            },
            channels: { welcome: '┏「👋」ʙɪᴇɴᴠᴇɴɪᴅᴀ', log: '┣「📖」ʀᴇɢɪsᴛʀᴏ-ᴅᴇ-ᴛʀɪʙᴜ', checkin: '┣「⏱️」ᴄʜᴇᴄᴋ-ɪɴ', goodbye: '┣「🚪」ʙʏᴇ', bans: '┗「🚫」ʙᴀɴᴇᴀᴅᴏs', leaderRoom: '👑・sᴀʟᴀ-ᴅᴇ-lɪᴅᴇʀᴇs' }
        };

        try {
            // --- HELPERS ---
            const ensureRole = async (key, name, color) => {
                let role = config.roles[key] ? guild.roles.cache.get(config.roles[key]) : undefined;
                if (!role) role = guild.roles.cache.find(r => r.name === name);
                if (!role) role = await guild.roles.create({ name, color });
                return role.id;
            };

            const ensureCat = async (key, name) => {
                let cat = config.categories[key] ? guild.channels.cache.get(config.categories[key]) : undefined;
                if (!cat) cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === name);
                if (!cat) cat = await guild.channels.create({ name, type: ChannelType.GuildCategory });
                return cat;
            };

            const ensureChan = async (key, name, parentId) => {
                let chan = config.channels[key] ? guild.channels.cache.get(config.channels[key]) : undefined;
                if (!chan) chan = guild.channels.cache.find(c => c.name === name);
                if (!chan) chan = await guild.channels.create({ name, type: ChannelType.GuildText, parent: parentId });
                else if (chan.parentId !== parentId) await chan.setParent(parentId, { lockPermissions: false });
                return chan.id;
            };

            // 1. ROLES
            config.roles.unverified = await ensureRole('unverified', DEFAULTS.roles.unverified, '#808080');
            config.roles.survivor = await ensureRole('survivor', DEFAULTS.roles.survivor, '#00FF00');
            config.roles.leader = await ensureRole('leader', DEFAULTS.roles.leader, '#FFD700');

            // 2. CATEGORÍAS
            const catPrivate = await ensureCat('private_registration', DEFAULTS.categories.private_register);
            config.categories.private_registration = catPrivate.id;
            
            const catPublic = await ensureCat('registration', DEFAULTS.categories.register);
            config.categories.registration = catPublic.id;

            const catTribes = await ensureCat('tribes', DEFAULTS.categories.tribes);
            config.categories.tribes = catTribes.id;

            // ==================================================================
            // 3. ORDENAMIENTO "BULLDOZER" (EMPUJAR TODO ABAJO)
            // ==================================================================
            // Obtenemos TODAS las categorías del servidor
            const allCategories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory);
            
            // IDs de nuestras categorías prioritarias
            const topPriorityIds = [catPrivate.id, catPublic.id, catTribes.id];
            
            // Filtramos el resto de categorías (las que no son nuestras) y las ordenamos por su posición actual
            const otherCategories = allCategories
                .filter(c => !topPriorityIds.includes(c.id))
                .sort((a, b) => a.position - b.position);

            const positionsToSet = [];

            // 1. Ponemos las nuestras arriba (0, 1, 2)
            positionsToSet.push({ channel: catPrivate.id, position: 0 });
            positionsToSet.push({ channel: catPublic.id, position: 1 });
            positionsToSet.push({ channel: catTribes.id, position: 2 });

            // 2. Ponemos el resto a partir de la 3
            let currentPos = 3;
            otherCategories.forEach(c => {
                positionsToSet.push({ channel: c.id, position: currentPos });
                currentPos++;
            });

            // 3. Aplicar el cambio masivo
            await guild.channels.setPositions(positionsToSet);
            
            // Bloquear visión de la privada
            await catPrivate.permissionOverwrites.edit(guild.id, { ViewChannel: false });

            // 4. CANALES Y PADRES
            const regCatId = config.categories.registration;
            config.channels.welcome = await ensureChan('welcome', DEFAULTS.channels.welcome, regCatId);
            config.channels.log = await ensureChan('log', DEFAULTS.channels.log, regCatId);
            config.channels.checkin_log = await ensureChan('checkin_log', DEFAULTS.channels.checkin, regCatId);
            
            const checkinChan = guild.channels.cache.get(config.channels.checkin_log);
            if (checkinChan) await checkinChan.permissionOverwrites.edit(guild.id, { SendMessages: false });

            config.channels.goodbye = await ensureChan('goodbye', DEFAULTS.channels.goodbye, regCatId);
            config.channels.ban_notifications = await ensureChan('ban_notifications', DEFAULTS.channels.bans, regCatId);
            
            config.channels.leader_channel = await ensureChan('leader_channel', DEFAULTS.channels.leaderRoom, config.categories.tribes);
            const leaderChan = guild.channels.cache.get(config.channels.leader_channel);
            if (leaderChan) {
                await leaderChan.permissionOverwrites.edit(guild.id, { ViewChannel: false });
                await leaderChan.permissionOverwrites.edit(config.roles.leader, { ViewChannel: true, SendMessages: true });
            }

            saveGuildConfig(guild.id, config);

            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('🆘 Soporte').setStyle(ButtonStyle.Link).setURL(SUPPORT_INVITE_LINK));
            await interaction.editReply({ content: `✅ **Setup Finalizado.**\nSe ha reestructurado el orden de categorías del servidor.`, components: [row] });

        } catch (error) { 
            console.error(error); 
            await interaction.editReply(`❌ Error en setup: ${error.message}`); 
        }
    },
};