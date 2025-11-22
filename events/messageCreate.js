const { Events, MessageFlags, EmbedBuilder, ChannelType } = require('discord.js');
const { loadGuildConfig, loadTribes, saveTribes, isPremium } = require('../utils/dataManager');
const { iniciarRegistro } = require('./guildMemberAdd'); 

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot || !message.guild) return;
        if (!isPremium(message.guild.id)) return;

        const guild = message.guild;
        const member = message.member;
        if (!member) return;

        const config = loadGuildConfig(guild.id);
        if (!config) return;

        const unverifiedRole = guild.roles.cache.get(config.roles.unverified);
        const survivorRole = config.roles.survivor ? guild.roles.cache.get(config.roles.survivor) : null;
        const leaderRole = config.roles.leader ? guild.roles.cache.get(config.roles.leader) : null;

        // ==================================================================
        // 1. AUTO-ASIGNACIÓN AL HABLAR (LÓGICA INTELIGENTE)
        // ==================================================================
        // Si el usuario NO tiene ninguno de los roles del sistema, se le considera "nuevo".
        // Ignoramos roles de Nitro, bots, juegos, etc.
        const hasSystemRole = 
            (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) ||
            (survivorRole && member.roles.cache.has(survivorRole.id)) ||
            (leaderRole && member.roles.cache.has(leaderRole.id));

        if (unverifiedRole && !hasSystemRole) {
            console.log(`⚡ [MessageCreate] Usuario ${member.user.tag} habló sin roles de sistema. Iniciando registro...`);
            await member.roles.add(unverifiedRole).catch(()=>{});
            await iniciarRegistro(member);
            return;
        }

        // ==================================================================
        // 2. PORTERO (Bloqueo de No Verificados)
        // ==================================================================
        if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
            // Lista Blanca
            if (message.channel.name.startsWith('registro-')) return; 
            if (message.channel.topic && message.channel.topic.includes('SYSTEM:REGISTRO')) return;
            if (config.categories.private_registration && message.channel.parentId === config.categories.private_registration) return;

            // Borrar mensaje no autorizado
            try { await message.delete(); } catch(e){}

            const suffix = member.id.slice(-4);
            const existingChannel = guild.channels.cache.find(c => 
                c.type === ChannelType.GuildText && 
                ((c.topic && c.topic.includes(member.id)) || (c.name.includes(suffix) && c.name.includes('registro')))
            );

            if (!existingChannel) {
                console.log(`🚑 Usuario ${member.user.tag} intentó hablar sin canal de registro. Creando uno nuevo...`);
                await iniciarRegistro(member);
            } else {
                const warning = new EmbedBuilder().setColor('Red').setDescription(`⛔ **Acceso Denegado:** Termina tu registro aquí: ${existingChannel}`);
                message.channel.send({ content: `${member}`, embeds: [warning] })
                    .then(m => setTimeout(() => m.delete().catch(()=>{}), 5000));
            }
            return;
        }

        // ==================================================================
        // 3. CHECK-IN PASIVO
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