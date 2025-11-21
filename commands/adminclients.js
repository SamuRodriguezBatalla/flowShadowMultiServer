const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getAllPremiumGuilds } = require('../utils/dataManager');

// 🔒 TU ID REAL
const OWNER_ID = '749826568477474888'; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('adminclients')
        .setDescription('🔒 ADMIN: Muestra la tabla de clientes y su estado.'),

    async execute(interaction) {
        // 1. SEGURIDAD: Solo tú puedes ver esto
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({ content: '⛔ Acceso denegado.', ephemeral: true });
        }

        // 2. OBTENER DATOS
        const clients = getAllPremiumGuilds(); // Esta función ya la creamos en dataManager

        if (!clients || clients.length === 0) {
            return interaction.reply({ content: '📂 La base de datos de clientes está vacía.', ephemeral: true });
        }

        // 3. CONSTRUIR LA TABLA
        // Usamos bloques de código ```text``` para que las columnas se alineen bien
        let tableHeader = "CLIENTE          | TIPO      | DÍAS | ID SERVIDOR\n";
        let separator   = "---------------------------------------------------\n";
        let tableBody   = "";

        const now = Date.now();
        let totalIncomeEstimado = 0; // Contador visual simple

        clients.forEach(client => {
            // Cálculo de días
            const daysActive = Math.floor((now - client.added_at) / (1000 * 60 * 60 * 24));
            
            // Formateo de columnas (padding para alinear)
            // Cortamos el nombre a 15 caracteres para que no rompa la tabla
            const name = (client.client_name || "Desconocido").substring(0, 15).padEnd(16, ' ');
            
            const type = client.is_unlimited === 1 ? "♾️ VIP " : "📅 Mes ";
            
            // Si es mensual, sumamos al contador (ejemplo visual)
            if (client.is_unlimited === 0) totalIncomeEstimado++;

            const days = `${daysActive}d`.padEnd(4, ' ');
            
            tableBody += `${name} | ${type} | ${days} | ${client.guild_id}\n`;
        });

        // Si la lista es muy larga, Discord corta a los 4000 caracteres. 
        // Cortamos por seguridad si tienes muchísimos clientes.
        if (tableBody.length > 3500) {
            tableBody = tableBody.substring(0, 3500) + "\n... (Lista truncada, hay demasiados clientes)";
        }

        // 4. ENVIAR EMBED
        const embed = new EmbedBuilder()
            .setTitle('📂 Cartera de Clientes FlowShadow')
            .setColor('Gold')
            .setDescription(`\`\`\`text\n${tableHeader}${separator}${tableBody}\`\`\``)
            .addFields(
                { name: '📊 Resumen', value: `Total Clientes: **${clients.length}**\nDe pago mensual: **${totalIncomeEstimado}**`, inline: true },
                { name: '🧠 Base de Datos', value: 'SQLite (Local)', inline: true }
            )
            .setFooter({ text: 'Informe generado automáticamente' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};