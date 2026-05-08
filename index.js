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

// ===== CLIENT (MUSI BYĆ NA GÓRZE) =====
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ===== KONKURSY =====
let konkursy = {};

// ===== TIME PARSER =====
function parseTime(input) {
    const match = input.match(/(\d+)([mhd])/);
    if (!match) return null;

    const value = parseInt(match[1]);
    const type = match[2];

    if (type === "m") return value * 60000;
    if (type === "h") return value * 3600000;
    if (type === "d") return value * 86400000;
}

// ===== STATUS HELPER =====
function status(k) {
    if (!k) return "⚪";
    if (Date.now() >= k.endTime) return "🔴 ZAKOŃCZONY";
    return "🟢 TRWA";
}

// ===== READY =====
client.once("ready", async () => {
    console.log(`Bot działa 🔥 (${client.user.tag})`);

    const commands = [
        new SlashCommandBuilder().setName("konkurs").setDescription("Tworzy konkurs"),

        new SlashCommandBuilder()
            .setName("konkurslist")
            .setDescription("Lista uczestników")
            .addStringOption(o => o.setName("nazwa").setDescription("Nazwa").setRequired(true)),

        new SlashCommandBuilder()
            .setName("konkursinfo")
            .setDescription("Info o konkursie")
            .addStringOption(o => o.setName("nazwa").setDescription("Nazwa").setRequired(true)),

        new SlashCommandBuilder()
            .setName("konkursstop")
            .setDescription("Zatrzymaj konkurs")
            .addStringOption(o => o.setName("nazwa").setDescription("Nazwa").setRequired(true)),

        new SlashCommandBuilder()
            .setName("reroll")
            .setDescription("Losuj ponownie zwycięzców")
            .addStringOption(o => o.setName("nazwa").setDescription("Nazwa").setRequired(true))
    ].map(c => c.toJSON());

    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands }
    );

    console.log("Slash OK ✔");
});

// ===== INTERACTIONS =====
client.on("interactionCreate", async interaction => {

    // ================= CREATE =================
    if (interaction.isChatInputCommand() && interaction.commandName === "konkurs") {

        const modal = new ModalBuilder()
            .setCustomId("create")
            .setTitle("🎉 Nowy konkurs");

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("name").setLabel("Nazwa").setStyle(TextInputStyle.Short)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("winners").setLabel("Wygrywa ile osób").setStyle(TextInputStyle.Short)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("time").setLabel("Czas (10m/2h/2d)").setStyle(TextInputStyle.Short)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("desc").setLabel("Opis").setStyle(TextInputStyle.Paragraph)
            )
        );

        return interaction.showModal(modal);
    }

    // ================= MODAL =================
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === "create") {

        const name = interaction.fields.getTextInputValue("name");
        const winners = parseInt(interaction.fields.getTextInputValue("winners"));
        const timeInput = interaction.fields.getTextInputValue("time");
        const desc = interaction.fields.getTextInputValue("desc");

        const duration = parseTime(timeInput);
        if (!duration) return interaction.reply({ content: "❌ zły czas", ephemeral: true });

        const endTime = Date.now() + duration;

        const embed = new EmbedBuilder()
            .setTitle(`🎉 ${name}`)
            .setColor("#f1c40f")
            .setThumbnail(client.user.displayAvatarURL())
            .setDescription(
`✨ **${desc}**

━━━━━━━━━━━━━━
🏆 Wygrywa: ${winners}
👥 Uczestnicy: 0
⏰ Czas: ${timeInput}
🔥 Status: 🟢 TRWA
━━━━━━━━━━━━━━`
            )
            .setFooter({ text: "Kliknij Dołącz 🎯" })
            .setTimestamp();

        const button = new ButtonBuilder()
            .setCustomId(`join_${name}`)
            .setLabel("🎯 Dołącz")
            .setStyle(ButtonStyle.Success);

        const msg = await interaction.reply({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(button)],
            fetchReply: true
        });

        konkursy[name] = {
            name,
            participants: [],
            winners,
            endTime,
            msg,
            desc,
            channel: interaction.channel
        };

        // ================= TIMER =================
        const interval = setInterval(async () => {
            const k = konkursy[name];
            if (!k) return clearInterval(interval);

            const left = k.endTime - Date.now();
            if (left <= 0) return;

            let timeText =
                left < 60000
                    ? `${Math.floor(left / 1000)}s`
                    : left < 3600000
                    ? `${Math.floor(left / 60000)}m ${Math.floor((left % 60000) / 1000)}s`
                    : `${Math.floor(left / 3600000)}h ${Math.floor((left % 3600000) / 60000)}m`;

            const updated = new EmbedBuilder()
                .setTitle(`🎉 ${name}`)
                .setColor(left < 60000 ? "#e74c3c" : "#f1c40f")
                .setThumbnail(client.user.displayAvatarURL())
                .setDescription(
`✨ **${desc}**

━━━━━━━━━━━━━━
🏆 Wygrywa: ${k.winners}
👥 Uczestnicy: ${k.participants.length}
⏰ Zostało: ${timeText}
🔥 Status: 🟢 TRWA
━━━━━━━━━━━━━━`
                )
                .setTimestamp();

            k.msg.edit({ embeds: [updated] }).catch(() => {});
        }, 5000);

        setTimeout(() => endKonkurs(name), duration);
    }

    // ================= JOIN =================
    if (interaction.isButton()) {

        const [_, name] = interaction.customId.split("_");
        const k = konkursy[name];
        if (!k) return;

        if (k.participants.includes(interaction.user.id)) {
            return interaction.reply({ content: "❌ już jesteś", ephemeral: true });
        }

        k.participants.push(interaction.user.id);

        return interaction.reply({ content: "✅ dołączyłeś!", ephemeral: true });
    }

    // ================= LIST =================
    if (interaction.commandName === "konkurslist") {
        const name = interaction.options.getString("nazwa");
        const k = konkursy[name];

        if (!k) return interaction.reply({ content: "❌ brak", ephemeral: true });

        return interaction.reply({
            content: k.participants.map(x => `<@${x}>`).join("\n") || "brak",
            ephemeral: true
        });
    }

    // ================= INFO =================
    if (interaction.commandName === "konkursinfo") {
        const name = interaction.options.getString("nazwa");
        const k = konkursy[name];

        if (!k) return interaction.reply({ content: "❌ brak", ephemeral: true });

        return interaction.reply({
            content:
`🎉 ${k.name}
👥 ${k.participants.length}
🏆 ${k.winners}
🔥 ${status(k)}`,
            ephemeral: true
        });
    }

    // ================= STOP =================
    if (interaction.commandName === "konkursstop") {
        const name = interaction.options.getString("nazwa");

        if (!konkursy[name])
            return interaction.reply({ content: "❌ brak", ephemeral: true });

        endKonkurs(name);
        return interaction.reply({ content: "⛔ zatrzymano", ephemeral: true });
    }

    // ================= REROLL =================
    if (interaction.commandName === "reroll") {
        const name = interaction.options.getString("nazwa");
        const k = konkursy[name];

        if (!k) return interaction.reply({ content: "❌ brak", ephemeral: true });

        const win = k.participants
            .sort(() => 0.5 - Math.random())
            .slice(0, k.winners);

        return interaction.reply({
            content: `🎲 nowi wygrani:\n${win.map(x => `<@${x}>`).join("\n") || "brak"}`
        });
    }
});

// ================= END =================
async function endKonkurs(name) {
    const k = konkursy[name];
    if (!k) return;

    const win = k.participants
        .sort(() => 0.5 - Math.random())
        .slice(0, k.winners);

    const embed = new EmbedBuilder()
        .setTitle("🏁 KONKURS ZAKOŃCZONY")
        .setColor("#e74c3c")
        .setDescription(
`🎉 ${k.name}

🏆 Wygrani:
${win.map(x => `<@${x}>`).join("\n") || "brak"}

👥 ${k.participants.length}
🔴 ZAKOŃCZONY`
        )
        .setTimestamp();

    await k.channel.send({ embeds: [embed] });

    delete konkursy[name];
}

// ================= START =================
client.login(TOKEN);
