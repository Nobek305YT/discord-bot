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

// ✔ INTENTY (NAPRAWIA "BOT NIE REAGUJE")
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

let konkursy = {};

// ===== TIME =====
function parseTime(input) {
    const match = input.match(/(\d+)([mhd])/);
    if (!match) return null;

    const value = parseInt(match[1]);
    const type = match[2];

    if (type === "m") return value * 60000;
    if (type === "h") return value * 3600000;
    if (type === "d") return value * 86400000;
    return null;
}

function formatTime(ms) {
    if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
    if (ms < 3600000)
        return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

// ===== READY =====
client.once("ready", async () => {
    console.log(`Bot działa 🔥 (${client.user.tag})`);

    const commands = [
        new SlashCommandBuilder()
            .setName("konkurs")
            .setDescription("Tworzy konkurs"),

        new SlashCommandBuilder()
            .setName("konkurslist")
            .setDescription("Lista uczestników")
            .addStringOption(o =>
                o.setName("nazwa").setDescription("nazwa").setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName("konkursinfo")
            .setDescription("Info o konkursie")
            .addStringOption(o =>
                o.setName("nazwa").setDescription("nazwa").setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName("konkursstop")
            .setDescription("Zatrzymaj konkurs")
            .addStringOption(o =>
                o.setName("nazwa").setDescription("nazwa").setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName("reroll")
            .setDescription("Nowi wygrani")
            .addStringOption(o =>
                o.setName("nazwa").setDescription("nazwa").setRequired(true)
            )
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

    // ================= CREATE MODAL =================
    if (interaction.isChatInputCommand() && interaction.commandName === "konkurs") {

        const modal = new ModalBuilder()
            .setCustomId("create")
            .setTitle("🎉 Nowy konkurs");

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("name")
                    .setLabel("Nazwa")
                    .setStyle(TextInputStyle.Short)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("winners")
                    .setLabel("Ile osób wygrywa")
                    .setStyle(TextInputStyle.Short)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("time")
                    .setLabel("Czas (10m/2h/2d)")
                    .setStyle(TextInputStyle.Short)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId("desc")
                    .setLabel("Opis")
                    .setStyle(TextInputStyle.Paragraph)
            )
        );

        return interaction.showModal(modal);
    }

    // ================= CREATE =================
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === "create") {

        await interaction.deferReply();

        const name = interaction.fields.getTextInputValue("name").replace(/\s+/g, "_");
        const winners = parseInt(interaction.fields.getTextInputValue("winners"));
        const duration = parseTime(interaction.fields.getTextInputValue("time"));
        const desc = interaction.fields.getTextInputValue("desc");

        if (!duration)
            return interaction.editReply("❌ zły czas");

        const endTime = Date.now() + duration;

        const button = new ButtonBuilder()
            .setCustomId(`join_${name}`)
            .setLabel("🎯 Dołącz")
            .setStyle(ButtonStyle.Success);

        const embed = new EmbedBuilder()
            .setTitle(`🎉 ${name}`)
            .setColor("#f1c40f")
            .setDescription(
`✨ ${desc}

🏆 Wygrywa: ${winners}
👥 Uczestnicy: 0
⏰ Zostało: ${formatTime(duration)}
🔥 Status: TRWA`
            );

        const msg = await interaction.editReply({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(button)]
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

            if (left <= 0) {
                clearInterval(interval);
                return endKonkurs(name);
            }

            const updated = new EmbedBuilder()
                .setTitle(`🎉 ${name}`)
                .setColor(left < 60000 ? "#e74c3c" : "#f1c40f")
                .setDescription(
`✨ ${desc}

🏆 Wygrywa: ${k.winners}
👥 Uczestnicy: ${k.participants.length}
⏰ Zostało: ${formatTime(left)}
🔥 Status: TRWA`
                );

            k.msg.edit({ embeds: [updated] }).catch(() => {});
        }, 10000); // 🔥 stabilnie, bez laga
    }

    // ================= JOIN =================
    if (interaction.isButton()) {

        const name = interaction.customId.split("_")[1];
        const k = konkursy[name];

        if (!k)
            return interaction.reply({ content: "❌ brak konkursu", ephemeral: true });

        if (k.participants.includes(interaction.user.id))
            return interaction.reply({ content: "❌ już jesteś", ephemeral: true });

        k.participants.push(interaction.user.id);

        return interaction.reply({ content: "✅ dołączyłeś!", ephemeral: true });
    }

    // ================= LIST =================
    if (interaction.commandName === "konkurslist") {
        const k = konkursy[interaction.options.getString("nazwa")];

        if (!k)
            return interaction.reply({ content: "❌ brak", ephemeral: true });

        return interaction.reply({
            content: k.participants.map(x => `<@${x}>`).join("\n") || "brak",
            ephemeral: true
        });
    }

    // ================= INFO =================
    if (interaction.commandName === "konkursinfo") {
        const k = konkursy[interaction.options.getString("nazwa")];

        if (!k)
            return interaction.reply({ content: "❌ brak", ephemeral: true });

        return interaction.reply({
            content:
`🎉 ${k.name}
👥 ${k.participants.length}
🏆 ${k.winners}
⏰ ${formatTime(k.endTime - Date.now())}`,
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
        const k = konkursy[interaction.options.getString("nazwa")];

        if (!k)
            return interaction.reply({ content: "❌ brak", ephemeral: true });

        const win = k.participants
            .sort(() => 0.5 - Math.random())
            .slice(0, k.winners);

        return interaction.reply({
            content: `🎲 wygrani:\n${win.map(x => `<@${x}>`).join("\n") || "brak"}`
        });
    }
});

// ===== END =====
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
        );

    await k.channel.send({ embeds: [embed] });

    delete konkursy[name];
}

client.login(TOKEN);
