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

        // 1. AUTO-ASIGNACIÓN INSTANTÁNEA (Si solo tiene @everyone)
        if (unverifiedRole && member.roles.cache.size === 1) {
            console.log(`⚡ [MessageCreate] Asignando rol auto a ${member.user.tag}`);
            await member.roles.add(unverifiedRole).catch(()=>{});
            await iniciarRegistro(member);
            return;
        }

        // 2. PORTERO (Bloqueo de No Verificados)
        if (unverifiedRole && member.roles.cache.has(unverifiedRole.id)) {
            // Lista Blanca
            if (message.channel.name.startsWith('registro-')) return; 
            if (message.channel.topic && message.channel.topic.includes('SYSTEM:REGISTRO')) return;
            if (config.categories.private_registration && message.channel.parentId === config.categories.private_registration) return;

            // Borrar y Redirigir
            try { await message.delete(); } catch(e){}

            const suffix = member.id.slice(-4);
            const existingChannel = guild.channels.cache.find(c => 
                c.type === ChannelType.GuildText && 
                ((c.topic && c.topic.includes(member.id)) || (c.name.includes(suffix) && c.name.includes('registro')))
            );

            if (!existingChannel) {
                console.log(`🚑 Creando canal emergencia para ${member.user.tag}`);
                await iniciarRegistro(member);
            } else {
                const warning = new EmbedBuilder().setColor('Red').setDescription(`⛔ Ve a tu canal: ${existingChannel}`);
                message.channel.send({ content: `${member}`, embeds: [warning] }).then(m => setTimeout(() => m.delete().catch(()=>{}), 5000));
            }
            return;
        }

        // 3. CHECK-IN PASIVO
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