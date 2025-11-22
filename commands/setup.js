const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { saveGuildConfig, loadGuildConfig } = require('../utils/dataManager');

// 👇 ENLACE A TU SERVIDOR DE SOPORTE
const SUPPORT_INVITE_LINK = 'https://discord.gg/pBPRS64GKq'; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('⚙️ Inicializa el servidor y crea las categorías necesarias.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // 1. PROTECCIÓN ANTI-TIMEOUT
        try { 
            await interaction.deferReply(); 
        } catch (e) { 
            return console.log("La interacción de setup caducó."); 
        }

        const guild = interaction.guild;
        let config = loadGuildConfig(guild.id) || { roles: {}, channels: {}, categories: {} };

        const DEFAULTS = {
            roles: { survivor: 'Superviviente', unverified: 'No verificado', leader: 'Líder de Tribu' },
            categories: { 
                register: '📝 Zᴏɴᴀ ᴅᴇ Rᴇɢɪsᴛʀᴏ', 
                private_register: '🔐 Rᴇɢɪsᴛʀᴏ-Pʀɪᴠᴀᴅᴏ', 
                tribes: 'Tʀɪʙᴜs' 
            },
            channels: { welcome: '┏「👋」ʙɪᴇɴᴠᴇɴɪᴅᴀ', log: '┣「📖」ʀᴇɢɪsᴛʀᴏ-ᴅᴇ-ᴛʀɪʙᴜ', checkin: '┣「⏱️」ᴄʜᴇᴄᴋ-ɪɴ', goodbye: '┣「🚪」ʙʏᴇ', bans: '┗「🚫」ʙᴀɴᴇᴀᴅᴏs', leaderRoom: '👑・sᴀʟᴀ-ᴅᴇ-lɪᴅᴇʀᴇs' }
        };

        try {
            // --- FUNCIONES AUXILIARES ---
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
                return cat.id;
            };
            const ensureChan = async (key, name, parentId, type = ChannelType.GuildText) => {
                let chan = config.channels[key] ? guild.channels.cache.get(config.channels[key]) : undefined;
                if (!chan) chan = guild.channels.cache.find(c => c.name === name && c.parentId === parentId);
                if (!chan) chan = await guild.channels.create({ name, type, parent: parentId });
                return chan.id;
            };

            // 1. ROLES
            config.roles.unverified = await ensureRole('unverified', DEFAULTS.roles.unverified, '#808080');
            config.roles.survivor = await ensureRole('survivor', DEFAULTS.roles.survivor, '#00FF00');
            config.roles.leader = await ensureRole('leader', DEFAULTS.roles.leader, '#FFD700');

            // 2. CATEGORÍAS
            config.categories.registration = await ensureCat('registration', DEFAULTS.categories.register);
            
            // --- CATEGORÍA PRIVADA (CON PERMISOS DE SEGURIDAD) ---
            config.categories.private_registration = await ensureCat('private_registration', DEFAULTS.categories.private_register);
            const privateCat = guild.channels.cache.get(config.categories.private_registration);
            if (privateCat) {
                await privateCat.permissionOverwrites.edit(guild.id, { ViewChannel: false });
            }

            config.categories.tribes = await ensureCat('tribes', DEFAULTS.categories.tribes);
            const regCatId = config.categories.registration;

            // 3. CANALES
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

            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('🆘 Unirse al Servidor de Soporte').setStyle(ButtonStyle.Link).setURL(SUPPORT_INVITE_LINK));
            
            await interaction.editReply({ content: `✅ **Setup Completo.**\n📂 Categoría Privada: **${DEFAULTS.categories.private_register}** configurada.`, components: [row] });

        } catch (error) { 
            console.error(error); 
            await interaction.editReply(`❌ Error en setup: ${error.message}`); 
        }
    },
};