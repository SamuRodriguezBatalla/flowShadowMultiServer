const { Events, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { loadGuildConfig, loadTribes, saveTribes, getRegistrationState } = require('../utils/dataManager');
const { iniciarRegistro } = require('./guildMemberAdd'); 
const { handleRegistrationStep } = require('../utils/registrationHandler'); // Importamos el manejador

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        // 0. Validaciones básicas
        if (message.author.bot || !message.guild) return;

        const member = message.member;
        if (!member) return;

        const guild = message.guild;
        const config = loadGuildConfig(guild.id);
        if (!config) return;

        // ==================================================================
        // 👮 EL PORTERO (RESTRICCIÓN DE CHAT)
        // ==================================================================
        const unverifiedRole = guild.roles.cache.get(config.roles.unverified);
        
        const isImmune = 
            member.id === guild.ownerId ||
            member.permissions.has(PermissionFlagsBits.Administrator) ||
            (config.roles.admin && member.roles.cache.has(config.roles.admin)) ||
            (config.roles.staff && member.roles.cache.has(config.roles.staff));

        if (unverifiedRole && member.roles.cache.has(unverifiedRole.id) && !isImmune) {
            
            const isMyRegChannel = 
                (message.channel.topic && message.channel.topic.includes(`USER:${member.id}`)) ||
                (message.channel.name.includes(`registro`) && message.channel.name.includes(member.id.slice(-4)));

            if (!isMyRegChannel) {
                try { await message.delete(); } catch(e){}

                const suffix = member.id.slice(-4);
                const existingChannel = guild.channels.cache.find(c => 
                    c.type === ChannelType.GuildText && 
                    ((c.topic && c.topic.includes(member.id)) || (c.name.includes(suffix) && c.name.includes('registro')))
                );

                if (!existingChannel) {
                    console.log(`🚑 Usuario ${member.user.tag} intentó hablar sin canal. Creando...`);
                    await iniciarRegistro(member);
                } else {
                    const warning = await message.channel.send({ 
                        content: `${member}`, 
                        embeds: [new EmbedBuilder().setColor('Red').setDescription(`⛔ **Acceso Denegado:** Termina tu registro aquí: ${existingChannel}`)] 
                    });
                    setTimeout(() => warning.delete().catch(()=>{}), 5000);
                }
                return;
            }
        }

        // ==================================================================
        // 📝 SISTEMA DE REGISTRO (DELEGADO)
        // ==================================================================
        let state = null;
        try { state = getRegistrationState(message.channel.id); } catch (e) {}

        if (state) {
            if (message.author.id !== state.user_id && !isImmune) return;
            // Llamamos a la función externa para manejar los pasos
            await handleRegistrationStep(message, state);
            return; 
        }

        // ==================================================================
        // 3. CHECK-IN PASIVO (ACTIVIDAD DE TRIBUS)
        // ==================================================================
        let tribes = loadTribes(guild.id);
        let modified = false;
        for (const tName in tribes) {
            const tribe = tribes[tName];
            if (tribe.members.some(m => m.discordId === message.author.id)) {
                if (Date.now() - (tribe.lastActive || 0) > 3600000) {
                    tribe.lastActive = Date.now();
                    modified = true;
                }
                break;
            }
        }
        if (modified) saveTribes(guild.id, tribes);
    },
};
