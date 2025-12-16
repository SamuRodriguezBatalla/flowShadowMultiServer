const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { removeGameBan, getGameBans } = require('../utils/dataManager');
const { sendRconCommand } = require('../utils/rconManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('arkunban')
        .setDescription('🦖 Quita un baneo del servidor de Ark.')
        .addStringOption(o => o.setName('id_ark').setDescription('ID del juego a desbanear (SteamID/EOS/PSN)').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async execute(interaction) {
        await interaction.deferReply();
        const arkId = interaction.options.getString('id_ark');
        const guildId = interaction.guild.id;

        // 1. Ejecutar Unban en RCON
        const rconResult = await sendRconCommand(guildId, `UnbanPlayer "${arkId}"`);

        if (!rconResult.success) {
            return interaction.editReply(`❌ **Error RCON:** ${rconResult.message}`);
        }

        // 2. Buscar si teníamos registrado ese ban para avisar al usuario
        const bans = getGameBans(guildId);
        const banInfo = bans.find(b => b.ark_id === arkId);
        
        // 3. Eliminar de la base de datos
        removeGameBan(guildId, arkId);

        // 4. Intentar avisar al usuario (si tenemos su Discord ID)
        let notifStatus = '';
        if (banInfo && banInfo.discord_id) {
            try {
                const user = await interaction.client.users.fetch(banInfo.discord_id);
                await user.send({
                    embeds: [new EmbedBuilder()
                        .setTitle('🦖 Baneo de Ark Revocado')
                        .setColor('Green')
                        .setDescription(`Un administrador ha levantado tu baneo en el servidor de Ark de **${interaction.guild.name}**.`)
                        .setTimestamp()]
                });
                notifStatus = ' (Usuario notificado por MD)';
            } catch (e) {
                notifStatus = ' (No se pudo notificar al usuario)';
            }
        }

        const embed = new EmbedBuilder()
            .setTitle('🦖 Jugador Desbaneado en Ark')
            .setColor('Green')
            .setDescription(`El ID \`${arkId}\` ha sido desbaneado correctamente.${notifStatus}`)
            .addFields({ name: '🤖 Respuesta RCON', value: `\`${rconResult.response || 'Ok'}\`` });

        await interaction.editReply({ embeds: [embed] });
    },
};
