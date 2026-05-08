const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    InteractionType,
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const TOKEN = process.env.TOKEN;

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

let konkursy = {};

// ===== TIME =====
function parseTime(input) {
    const match = input.match(/(\d+)([mhd])/);
    if (!match) return null;

    const v = parseInt(match[1]);
    const t = match[2];

    if (t === "m") return v * 60000;
    if (t === "h") return v * 3600000;
    if (t === "d") return v * 86400000;
}

function formatTime(ms) {
    if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000)/1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000)/60000)}m`;
}

// ===== READY =====
client.once("ready", async () => {
    console.log(`Bot działa 🔥 ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder().setName("konkurs").setDescription("Tworzy konkurs"),

        new SlashCommandBuilder()
            .setName("konkurslist")
            .setDescription("Lista uczestników")
            .addStringOption(o => o.setName("nazwa").setRequired(true)),

        new SlashCommandBuilder()
            .setName("konkursusun")
            .setDescription("Usuń gracza")
            .addStringOption(o => o.setName("nazwa").setRequired(true))
            .addUserOption(o => o.setName("gracz").setRequired(true)),

        new SlashCommandBuilder()
            .setName("konkursinfo")
            .setDescription("Info o konkursie")
            .addStringOption(o => o.setName("nazwa").setRequired(true)),

        new SlashCommandBuilder()
            .setName("konkursreroll")
            .setDescription("Losuj ponownie")
            .addStringOption(o => o.setName("nazwa").setRequired(true)),

        new SlashCommandBuilder()
            .setName("konkursstop")
            .setDescription("Kończy konkurs")
            .addStringOption(o => o.setName("nazwa").setRequired(true))
    ].map(c => c.toJSON());

    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });

    console.log("✔ Komendy wgrane");
});

// ===== INTERACTION =====
client.on("interactionCreate", async interaction => {

    // ===== CREATE =====
    if (interaction.isChatInputCommand() && interaction.commandName === "konkurs") {

        const modal = new ModalBuilder()
            .setCustomId("create")
            .setTitle("🎉 Konkurs");

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("name").setLabel("Nazwa").setStyle(TextInputStyle.Short)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("winners").setLabel("Ile wygrywa").setStyle(TextInputStyle.Short)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("time").setLabel("Czas (10m/2h)").setStyle(TextInputStyle.Short)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("desc").setLabel("Opis").setStyle(TextInputStyle.Paragraph)
            )
        );

        return interaction.showModal(modal);
    }

    // ===== MODAL =====
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === "create") {

        const name = interaction.fields.getTextInputValue("name");
        const winners = parseInt(interaction.fields.getTextInputValue("winners"));
        const duration = parseTime(interaction.fields.getTextInputValue("time"));
        const desc = interaction.fields.getTextInputValue("desc");

        if (!duration) return interaction.reply({ content: "❌ zły czas", ephemeral: true });

        const endTime = Date.now() + duration;

        const embed = new EmbedBuilder()
            .setTitle(`🎉 ${name}`)
            .setColor("Gold")
            .setDescription(`👥 0\n🏆 ${winners}\n⏰ ${formatTime(duration)}\n\n${desc}`);

        const button = new ButtonBuilder()
            .setCustomId(`join_${name}`)
            .setLabel("Dołącz")
            .setStyle(ButtonStyle.Success);

        const msg = await interaction.reply({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(button)],
            fetchReply: true
        });

        konkursy[name] = { participants: [], winners, endTime, msg, desc };

        // TIMER
        const interval = setInterval(() => {
            const k = konkursy[name];
            if (!k) return clearInterval(interval);

            const left = k.endTime - Date.now();
            if (left <= 0) {
                clearInterval(interval);
                return endKonkurs(name);
            }

            const embed = new EmbedBuilder()
                .setTitle(`🎉 ${name}`)
                .setDescription(`👥 ${k.participants.length}\n🏆 ${k.winners}\n⏰ ${formatTime(left)}\n\n${desc}`)
                .setColor(left < 60000 ? "Red" : "Gold");

            k.msg.edit({ embeds: [embed] }).catch(()=>{});
        }, 1000);
    }

    // ===== BUTTON =====
    if (interaction.isButton()) {
        await interaction.deferUpdate();

        const name = interaction.customId.split("_")[1];
        const k = konkursy[name];
        if (!k) return;

        if (!k.participants.includes(interaction.user.id)) {
            k.participants.push(interaction.user.id);
        }
    }

    // ===== LIST =====
    if (interaction.commandName === "konkurslist") {
        const k = konkursy[interaction.options.getString("nazwa")];
        if (!k) return interaction.reply({ content: "❌ brak", ephemeral: true });

        return interaction.reply({
            content: k.participants.map(x => `<@${x}>`).join("\n") || "brak",
            ephemeral: true
        });
    }

    // ===== USUN =====
    if (interaction.commandName === "konkursusun") {
        const k = konkursy[interaction.options.getString("nazwa")];
        const user = interaction.options.getUser("gracz");

        if (!k) return interaction.reply({ content: "❌ brak", ephemeral: true });

        k.participants = k.participants.filter(x => x !== user.id);

        return interaction.reply({ content: "✅ usunięto", ephemeral: true });
    }

    // ===== INFO =====
    if (interaction.commandName === "konkursinfo") {
        const k = konkursy[interaction.options.getString("nazwa")];
        if (!k) return interaction.reply({ content: "❌ brak", ephemeral: true });

        return interaction.reply({
            content: `👥 ${k.participants.length}\n🏆 ${k.winners}`,
            ephemeral: true
        });
    }

    // ===== REROLL =====
    if (interaction.commandName === "konkursreroll") {
        const k = konkursy[interaction.options.getString("nazwa")];
        if (!k) return interaction.reply({ content: "❌ brak", ephemeral: true });

        const win = k.participants.sort(() => 0.5 - Math.random()).slice(0, k.winners);

        return interaction.reply(`🎉 Nowi wygrani:\n${win.map(x => `<@${x}>`).join("\n")}`);
    }

    // ===== STOP =====
    if (interaction.commandName === "konkursstop") {
        const name = interaction.options.getString("nazwa");
        return endKonkurs(name);
    }
});

// ===== END =====
async function endKonkurs(name) {
    const k = konkursy[name];
    if (!k) return;

    const win = k.participants
        .sort(() => 0.5 - Math.random())
        .slice(0, k.winners);

    await k.msg.channel.send(`🏁 KONIEC ${name}\n${win.map(x => `<@${x}>`).join("\n") || "brak"}`);

    delete konkursy[name];
}

client.login(TOKEN);
