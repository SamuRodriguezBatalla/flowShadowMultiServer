const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { saveGuildConfig, loadGuildConfig } = require('../utils/dataManager');

const SUPPORT_INVITE_LINK = 'https://discord.gg/pBPRS64GKq'; 
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('⚙️ [V6] Setup Estable: Orden Forzado + Protección Admins.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply();
        const guild = interaction.guild;
        
        // 1. PRE-CARGA
        await interaction.editReply("🔄 **Escaneando servidor...**");
        await guild.channels.fetch(); 
        const allMembers = await guild.members.fetch(); 

        let config = loadGuildConfig(guild.id) || { roles: {}, channels: {}, categories: {} };

        const DEFAULTS = {
            roles: { survivor: 'Superviviente', unverified: 'No verificado', leader: 'Líder de Tribu' },
            categories: { private: '🔐 Rᴇɢɪsᴛʀᴏ-Pʀɪᴠᴀᴅᴏ', public: '📝 Zᴏɴᴀ ᴅᴇ Rᴇɢɪsᴛʀᴏ', tribes: 'Tʀɪʙᴜs' },
            channels: { welcome: '┏「👋」ʙɪᴇɴᴠᴇɴɪᴅᴀ', log: '┣「📖」ʀᴇɢɪsᴛʀᴏ-ᴅᴇ-ᴛʀɪʙᴜ', checkin: '┣「⏱️」ᴄʜᴇᴄᴋ-ɪɴ', goodbye: '┣「🚪」ʙʏᴇ', bans: '┗「🚫」ʙᴀɴᴇᴀᴅᴏs', leaderRoom: '👑・sᴀʟᴀ-ᴅᴇ-lɪᴅᴇʀᴇs' }
        };

        try {
            // HELPERS
            const ensureRole = async (k, n, c) => {
                let r = config.roles[k] ? guild.roles.cache.get(config.roles[k]) : guild.roles.cache.find(x => x.name === n);
                if (!r) r = await guild.roles.create({ name: n, color: c, reason: 'Bot Setup' });
                return r.id;
            };

            const ensureCat = async (k, n) => {
                let c = config.categories[k] ? guild.channels.cache.get(config.categories[k]) : guild.channels.cache.find(x => x.type === ChannelType.GuildCategory && x.name === n);
                if (!c) c = await guild.channels.create({ name: n, type: ChannelType.GuildCategory });
                return c;
            };

            const ensureChan = async (k, n, pid) => {
                let c = config.channels[k] ? guild.channels.cache.get(config.channels[k]) : guild.channels.cache.find(x => x.name === n);
                if (!c) c = await guild.channels.create({ name: n, type: ChannelType.GuildText, parent: pid });
                else if (c.parentId !== pid) await c.setParent(pid);
                return c.id;
            };

            // 2. ROLES
            await interaction.editReply("🔄 Configurando Roles...");
            config.roles.unverified = await ensureRole('unverified', DEFAULTS.roles.unverified, '#808080');
            config.roles.survivor = await ensureRole('survivor', DEFAULTS.roles.survivor, '#00FF00');
            config.roles.leader = await ensureRole('leader', DEFAULTS.roles.leader, '#FFD700');

            // 3. CATEGORÍAS
            await interaction.editReply("🔄 Configurando Categorías...");
            const catPrivate = await ensureCat('private_registration', DEFAULTS.categories.private);
            config.categories.private_registration = catPrivate.id;
            const catPublic = await ensureCat('registration', DEFAULTS.categories.public);
            config.categories.registration = catPublic.id;
            const catTribes = await ensureCat('tribes', DEFAULTS.categories.tribes);
            config.categories.tribes = catTribes.id;

            // 4. ORDENAMIENTO NUCLEAR (Mantenemos esto porque funciona bien)
            await interaction.editReply("🏗️ **Forzando orden de categorías (0, 1, 2)...**");
            
            const allCats = [...guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).values()];
            const otherCats = allCats.filter(c => c.id !== catPrivate.id && c.id !== catPublic.id && c.id !== catTribes.id)
                                     .sort((a, b) => a.position - b.position);

            const payload = [
                { channel: catPrivate.id, position: 0 },
                { channel: catPublic.id, position: 1 },
                { channel: catTribes.id, position: 2 }
            ];

            let i = 3;
            for (const c of otherCats) { payload.push({ channel: c.id, position: i++ }); }

            await guild.channels.setPositions(payload);

            // 5. CANALES HIJOS
            await catPrivate.permissionOverwrites.edit(guild.id, { ViewChannel: false });
            const regCatId = config.categories.registration;
            
            config.channels.welcome = await ensureChan('welcome', DEFAULTS.channels.welcome, regCatId);
            config.channels.log = await ensureChan('log', DEFAULTS.channels.log, regCatId);
            config.channels.checkin_log = await ensureChan('checkin_log', DEFAULTS.channels.checkin, regCatId);
            config.channels.goodbye = await ensureChan('goodbye', DEFAULTS.channels.goodbye, regCatId);
            config.channels.ban_notifications = await ensureChan('ban_notifications', DEFAULTS.channels.bans, regCatId);
            
            const checkinChan = guild.channels.cache.get(config.channels.checkin_log);
            if (checkinChan) await checkinChan.permissionOverwrites.edit(guild.id, { SendMessages: false });

            config.channels.leader_channel = await ensureChan('leader_channel', DEFAULTS.channels.leaderRoom, config.categories.tribes);
            const leaderChan = guild.channels.cache.get(config.channels.leader_channel);
            if (leaderChan) {
                await leaderChan.permissionOverwrites.edit(guild.id, { ViewChannel: false });
                await leaderChan.permissionOverwrites.edit(config.roles.leader, { ViewChannel: true, SendMessages: true });
            }

            saveGuildConfig(guild.id, config);

            // 6. AUTO-ROL (CON PROTECCIÓN DE ADMINS)
            await interaction.editReply("👮 **Aplicando Auto-Rol (Excluyendo Admins)...**");
            const unverifiedRole = guild.roles.cache.get(config.roles.unverified);
            
            const targets = allMembers.filter(m => {
                if (m.user.bot) return false;
                
                // 🛡️ FILTRO ADMIN RESTAURADO
                if (m.permissions.has(PermissionFlagsBits.Administrator)) return false;

                const hasSys = [config.roles.unverified, config.roles.survivor, config.roles.leader].some(id => m.roles.cache.has(id));
                return !hasSys;
            });

            if (targets.size > 0) {
                if (guild.members.me.roles.highest.position > unverifiedRole.position) {
                    for (const [id, m] of targets) {
                        await m.roles.add(unverifiedRole).catch(()=>{});
                        await sleep(100);
                    }
                } else {
                    await interaction.followUp("⚠️ ERROR: Sube mi rol por encima de 'No Verificado'.");
                }
            }

            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Soporte').setStyle(ButtonStyle.Link).setURL(SUPPORT_INVITE_LINK));
            await interaction.editReply({ content: `✅ **SETUP COMPLETADO**\n\n- Estructura creada y ordenada.\n- Roles de sistema asignados (Admins seguros).\n\n*Si algo no se ve bien, CTRL+R.*`, components: [row] });

        } catch (e) {
            console.error(e);
            interaction.editReply(`❌ ERROR: ${e.message}`);
        }
    },
};