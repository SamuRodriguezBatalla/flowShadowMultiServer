require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");

const commands = [];
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith(".js"));

// Opciones vacías para checkout global
const seasonChoices = []; 

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ("data" in command && "execute" in command) {
        let commandData;
        if (typeof command.createData === 'function') {
            commandData = command.createData(seasonChoices);
        } else {
            commandData = command.data;
        }
        commands.push(commandData.toJSON());
    }
}

const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);

(async () => {
    try {
        console.log(`🔄 Registrando ${commands.length} comandos GLOBALMENTE...`);
        
        // Registro global (sin GUILD_ID)
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );

        console.log("✅ Comandos registrados. Pueden tardar 1h en aparecer en todos los servidores.");
    } catch (error) {
        console.error("❌ Error:", error);
    }
})();