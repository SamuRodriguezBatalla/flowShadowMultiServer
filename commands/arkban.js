const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { addGameBan, loadTribes, addPermanentBan } = require('../utils/dataManager');
const { sendRconCommand } = require('../utils/rconManager');
const { logToTribe } = require('../utils/tribeLog');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('arkban')
        .setDescription('🦖 Baneo dentro del servidor de Ark.')
        .addUserOption(o => o.setName('usuario_discord').setDescription('Usuario de Discord (para notificar)').setRequired(true))
        .addStringOption(o => o.setName('id_ark').setDescription('ID del juego (SteamID/EOS/PSN)').setRequired(true))
        .addStringOption(o => o.setName('tipo').setDescription('Tipo de Baneo').setRequired(true)
            .addChoices(
                { name: '🕒 Por Horas', value: 'horas' },
                { name: '🍂 Por Season (Hasta Wipe)', value: 'season' },
                { name: '⛔ Permanente', value: 'perm' }
            ))
        .addStringOption(o => o.setName('razon').setDescription('Motivo').setRequired(true))
        .addIntegerOption(o => o.setName('duracion').setDescription('Horas (Solo si elegiste Por Horas)'))
        .addBooleanOption(o => o.setName('ban_discord').setDescription('¿Banear también del Discord? (Default: False)'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async execute(interaction) {
        await interaction.deferReply();

        const userDiscord = interaction.options.getUser('usuario_discord');
        const arkId = interaction.options.getString('id_ark');
        const type = interaction.options.getString('tipo');
        const reason = interaction.options.getString('razon');
        const hours = interaction.options.getInteger('duracion') || 0;
        const banFromDiscord = interaction.options.getBoolean('ban_discord') || false;
        const guild = interaction.guild;

        if (type === 'horas' && hours <= 0) {
            return interaction.editReply('❌ Debes especificar una duración mayor a 0 para el baneo por horas.');
        }

        // 1. EJECUTAR BAN EN ARK (RCON)
        const rconResult = await sendRconCommand(guild.id, `BanPlayer "${arkId}"`);
        
        if (!rconResult.success) {
            return interaction.editReply(`❌ **Error RCON:** ${rconResult.message}\n¿Has configurado el servidor con \`/setupark\`?`);
        }

        // 2. GUARDAR EN DB
        addGameBan(guild.id, userDiscord.id, arkId, type, hours, reason, interaction.user.id);

        // 3. NOTIFICACIONES
        const tribes = loadTribes(guild.id);
        let targetTribe = null;

        // Buscar tribu
        for (const tName in tribes) {
            if (tribes[tName].members.some(m => m.discordId === userDiscord.id)) {
                targetTribe = tribes[tName];
                break;
            }
        }

        const typeText = type === 'horas' ? `${hours} Horas` : (type === 'season' ? 'Esta Season' : 'Permanente');
        const desc = `🚫 **JUGADOR BANEADO DE ARK**\n👤 **Jugador:** ${userDiscord.tag}\n🆔 **ID Ark:** ${arkId}\n⏱️ **Duración:** ${typeText}\n📝 **Razón:** ${reason}`;

        // Aviso a Tribu
        if (targetTribe) {
            await logToTribe(guild, targetTribe, '🦖 Miembro Baneado en Ark', desc, 'Red');
        }

        // Aviso MD
        try {
            await userDiscord.send({
                embeds: [new EmbedBuilder().setTitle('🦖 Baneado del Servidor de Ark').setColor('Red').setDescription(desc).setFooter({text: guild.name})]
            });
        } catch (e) {}

        // 4. BANEO DE DISCORD (Opcional)
        let discordStatus = 'No aplicado.';
        if (banFromDiscord) {
            try {
                // Si es permanente en juego, se guarda como permaban en Discord también
                if (type === 'perm') {
                    addPermanentBan(guild.id, userDiscord.id, `[Ark Perm] ${reason}`, interaction.user.id);
                }
                await guild.members.ban(userDiscord.id, { reason: `[ARK-BAN LINKED] ${reason}` });
                discordStatus = '✅ Usuario baneado también de Discord.';
            } catch (e) {
                discordStatus = '⚠️ Error al banear de Discord (Check permisos).';
            }
        }

        // 5. RESPUESTA
        const embed = new EmbedBuilder()
            .setTitle('🦖 Ark Ban Ejecutado')
            .setColor('DarkRed')
            .addFields(
                { name: '🎮 ID Ark', value: `\`${arkId}\``, inline: true },
                { name: '👤 Discord', value: `${userDiscord}`, inline: true },
                { name: '⏱️ Tipo', value: typeText, inline: true },
                { name: '📝 Razón', value: reason, inline: false },
                { name: '🤖 Respuesta RCON', value: `\`${rconResult.response || 'Ok'}\``, inline: false },
                { name: '🌐 Discord Status', value: discordStatus, inline: false }
            );

        await interaction.editReply({ embeds: [embed] });
    }
};
