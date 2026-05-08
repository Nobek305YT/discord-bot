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
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ================= KONKURSY =================
let konkursy = {};

// ================= TIME =================
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

// ================= READY =================
client.once("ready", async () => {
    console.log(`Bot działa 🔥 (${client.user.tag})`);

    const commands = [
        new SlashCommandBuilder()
            .setName("konkurs")
            .setDescription("Tworzy konkurs"),

        new SlashCommandBuilder()
            .setName("konkurslist")
            .setDescription("Lista uczestników")
            .addStringOption(opt =>
                opt.setName("id")
                    .setDescription("ID konkursu")
                    .setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName("konkursusun")
            .setDescription("Usuń gracza z konkursu")
            .addStringOption(opt =>
                opt.setName("id")
                    .setDescription("ID konkursu")
                    .setRequired(true)
            )
            .addUserOption(opt =>
                opt.setName("gracz")
                    .setDescription("Gracz")
                    .setRequired(true)
            )
    ].map(c => c.toJSON());

    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands }
    );

    console.log("Slash OK ✔");
});

// ================= INTERACTIONS =================
client.on("interactionCreate", async interaction => {

    // ===== /KONKURS =====
    if (interaction.isChatInputCommand() && interaction.commandName === "konkurs") {

        const modal = new ModalBuilder()
            .setCustomId("createKonkurs")
            .setTitle("🎉 Nowy konkurs");

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("name").setLabel("Nazwa").setStyle(TextInputStyle.Short)
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder().setCustomId("winners").setLabel("Ile wygrywa").setStyle(TextInputStyle.Short)
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

    // ===== CREATE =====
    if (interaction.type === InteractionType.ModalSubmit && interaction.customId === "createKonkurs") {

        const name = interaction.fields.getTextInputValue("name");
        const winners = parseInt(interaction.fields.getTextInputValue("winners"));
        const timeInput = interaction.fields.getTextInputValue("time");
        const desc = interaction.fields.getTextInputValue("desc");

        if (isNaN(winners) || winners <= 0) {
            return interaction.reply({ content: "❌ Zła liczba zwycięzców", ephemeral: true });
        }

        const duration = parseTime(timeInput);
        if (!duration) {
            return interaction.reply({ content: "❌ Zły format czasu (np. 10m / 2h / 1d)", ephemeral: true });
        }

        const id = Date.now().toString();
        const endTime = Date.now() + duration;

        const embed = new EmbedBuilder()
            .setTitle(`🎉 ${name}`)
            .setDescription(
`✨ **${desc}**

🆔 ID: **${id}**

╭🏆 Wygrywa: **${winners}**
├👥 Uczestnicy: **0**
├⏰ Czas: **${timeInput}**
╰🔥 Status: **TRWA**`
            )
            .setColor("#FFD700")
            .setThumbnail(client.user.displayAvatarURL())
            .setFooter({ text: "Kliknij przycisk aby dołączyć 🎯" })
            .setTimestamp();

        const button = new ButtonBuilder()
            .setCustomId(`join_${id}`)
            .setLabel("🎯 Dołącz")
            .setStyle(ButtonStyle.Success);

        const msg = await interaction.reply({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(button)],
            fetchReply: true
        });

        konkursy[id] = {
            name,
            participants: [],
            winners,
            endTime,
            msg,
            desc,
            channel: interaction.channel
        };

        // ===== TIMER =====
        const interval = setInterval(async () => {
            const k = konkursy[id];
            if (!k) return clearInterval(interval);

            const left = k.endTime - Date.now();
            if (left <= 0) return;

            let timeText;

            if (left < 60000) {
                timeText = `${Math.floor(left / 1000)}s`;
            } else if (left < 3600000) {
                const m = Math.floor(left / 60000);
                const s = Math.floor((left % 60000) / 1000);
                timeText = `${m}m ${s}s`;
            } else {
                const h = Math.floor(left / 3600000);
                const m = Math.floor((left % 3600000) / 60000);
                timeText = `${h}h ${m}m`;
            }

            const updated = new EmbedBuilder()
                .setTitle(`🎉 ${k.name}`)
                .setDescription(
`✨ **${k.desc}**

🆔 ID: **${id}**

╭🏆 Wygrywa: **${k.winners}**
├👥 Uczestnicy: **${k.participants.length}**
├⏰ Zostało: **${timeText}**
╰🔥 Status: **TRWA**`
                )
                .setColor("#FFD700")
                .setTimestamp();

            k.msg.edit({ embeds: [updated] }).catch(() => {});
        }, 5000);

        // ===== END =====
        setTimeout(async () => {
            const k = konkursy[id];
            if (!k) return;

            const win = k.participants
                .sort(() => 0.5 - Math.random())
                .slice(0, k.winners);

            const endEmbed = new EmbedBuilder()
                .setTitle("🏁 KONKURS ZAKOŃCZONY")
                .setDescription(
`🎉 **${k.name}**

🆔 ID: **${id}**

🏆 Wygrani:
${win.map(x => `<@${x}>`).join("\n") || "brak"}

👥 Uczestników: ${k.participants.length}
🔥 Status: **ZAKOŃCZONY**`
                )
                .setColor("Red")
                .setTimestamp();

            try {
                await k.channel.send({ embeds: [endEmbed] });
            } catch {}

            // disable button
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel("Konkurs zakończony")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );

            k.msg.edit({ components: [disabledRow] }).catch(() => {});

            delete konkursy[id];

        }, duration);
    }

    // ===== JOIN =====
    if (interaction.isButton()) {

        const [action, id] = interaction.customId.split("_");
        const k = konkursy[id];
        if (!k) return;

        if (action !== "join") return;

        const userId = interaction.user.id;

        if (k.participants.includes(userId)) {
            return interaction.reply({
                content: "❌ Już jesteś w konkursie",
                ephemeral: true
            });
        }

        k.participants.push(userId);

        return interaction.reply({
            content: "✅ Dołączyłeś!",
            ephemeral: true
        });
    }

    // ===== LIST =====
    if (interaction.isChatInputCommand() && interaction.commandName === "konkurslist") {

        const id = interaction.options.getString("id");
        const k = konkursy[id];

        if (!k) return interaction.reply({ content: "❌ Brak konkursu", ephemeral: true });

        return interaction.reply({
            content:
                `📋 **${k.name}**\n` +
                (k.participants.map(x => `<@${x}>`).join("\n") || "brak"),
            ephemeral: true
        });
    }

    // ===== USUŃ =====
    if (interaction.isChatInputCommand() && interaction.commandName === "konkursusun") {

        const id = interaction.options.getString("id");
        const user = interaction.options.getUser("gracz");

        const k = konkursy[id];
        if (!k) return interaction.reply({ content: "❌ Brak konkursu", ephemeral: true });

        k.participants = k.participants.filter(x => x !== user.id);

        return interaction.reply({
            content: `✅ Usunięto ${user.tag}`,
            ephemeral: true
        });
    }
});

// ================= START =================
client.login(TOKEN);
