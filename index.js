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

client.login(process.env.TOKEN);

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
                opt.setName("nazwa")
                    .setDescription("Nazwa konkursu")
                    .setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName("konkursusun")
            .setDescription("Usuń gracza z konkursu")
            .addStringOption(opt =>
                opt.setName("nazwa")
                    .setDescription("Nazwa konkursu")
                    .setRequired(true)
            )
            .addUserOption(opt =>
                opt.setName("gracz")
                    .setDescription("Wybierz gracza")
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

        const name = new TextInputBuilder()
            .setCustomId("name")
            .setLabel("Nazwa konkursu")
            .setStyle(TextInputStyle.Short);

        const winners = new TextInputBuilder()
            .setCustomId("winners")
            .setLabel("Ile osób wygrywa?")
            .setStyle(TextInputStyle.Short);

        const time = new TextInputBuilder()
            .setCustomId("time")
            .setLabel("Czas (10m / 2h / 2d)")
            .setStyle(TextInputStyle.Short);

        const desc = new TextInputBuilder()
            .setCustomId("desc")
            .setLabel("Opis konkursu")
            .setStyle(TextInputStyle.Paragraph);

        modal.addComponents(
            new ActionRowBuilder().addComponents(name),
            new ActionRowBuilder().addComponents(winners),
            new ActionRowBuilder().addComponents(time),
            new ActionRowBuilder().addComponents(desc)
        );

        return interaction.showModal(modal);
    }

    // ===== CREATE =====
    if (interaction.type === InteractionType.ModalSubmit &&
        interaction.customId === "createKonkurs") {

        const name = interaction.fields.getTextInputValue("name");
        const winners = parseInt(interaction.fields.getTextInputValue("winners"));
        const timeInput = interaction.fields.getTextInputValue("time");
        const desc = interaction.fields.getTextInputValue("desc");

        const duration = parseTime(timeInput);

        if (!duration) {
            return interaction.reply({
                content: "❌ Zły format czasu!",
                ephemeral: true
            });
        }

        const endTime = Date.now() + duration;

        const embed = new EmbedBuilder()
            .setTitle(`🎉 ${name}`)
            .setDescription(`
✨ **${desc}**

🏆 Wygrywa: **${winners}**
👥 Uczestnicy: **0**
⏰ Zostało: **${timeInput}**
🔥 Status: **TRWA**
`)
            .setColor("Gold");

        const button = new ButtonBuilder()
            .setCustomId(`join_${name}`)
            .setLabel("Wejdź")
            .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(button);

        const msg = await interaction.reply({
            embeds: [embed],
            components: [row],
            fetchReply: true
        });

        konkursy[name] = {
            participants: [],
            winners,
            endTime,
            channelId: interaction.channel.id,
            msg,
            desc
        };

        // ===== TIMER =====
        const interval = setInterval(async () => {
            const k = konkursy[name];
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
                .setTitle(`🎉 ${name}`)
                .setDescription(`
✨ **${desc}**

🏆 Wygrywa: **${winners}**
👥 Uczestnicy: **${k.participants.length}**
⏰ Zostało: **${timeText}**
🔥 Status: **TRWA**
`)
                .setColor("Gold");

            try {
                await msg.edit({ embeds: [updated] });
            } catch {}
        }, 1000);

        // ===== END =====
        setTimeout(async () => {

            const k = konkursy[name];
            if (!k) return;

            const winnersList = k.participants
                .sort(() => 0.5 - Math.random())
                .slice(0, k.winners);

            const channel = await client.channels.fetch(k.channelId);

            const endEmbed = new EmbedBuilder()
                .setTitle("🏁 KONKURS ZAKOŃCZONY")
                .setDescription(`
🎉 **${name}**

🏆 Wygrani:
${winnersList.map(x => `<@${x}>`).join("\n") || "brak"}

👥 Uczestników: ${k.participants.length}
⏰ Status: **ZAKOŃCZONY**
`)
                .setColor("Red");

            await channel.send({ embeds: [endEmbed] });

            delete konkursy[name];

        }, duration);
    }

    // ===== JOIN =====
    if (interaction.isButton()) {

        const [action, name] = interaction.customId.split("_");
        const k = konkursy[name];
        if (!k) return;

        if (action !== "join") return;

        const id = interaction.user.id;

        if (k.participants.includes(id)) {
            return interaction.reply({
                content: "❌ Już jesteś w konkursie",
                ephemeral: true
            });
        }

        k.participants.push(id);

        return interaction.reply({
            content: "✅ Dołączyłeś/aś!",
            ephemeral: true
        });
    }

    // ===== LIST =====
    if (interaction.isChatInputCommand() && interaction.commandName === "konkurslist") {

        const name = interaction.options.getString("nazwa");
        const k = konkursy[name];

        if (!k) {
            return interaction.reply({
                content: "❌ Nie ma takiego konkursu",
                ephemeral: true
            });
        }

        return interaction.reply({
            content:
                `📋 **${name}:**\n` +
                (k.participants.map(x => `<@${x}>`).join("\n") || "brak"),
            ephemeral: true
        });
    }

    // ===== USUŃ GRACZA (USER PICKER) =====
    if (interaction.isChatInputCommand() && interaction.commandName === "konkursusun") {

        const name = interaction.options.getString("nazwa");
        const user = interaction.options.getUser("gracz");

        const k = konkursy[name];

        if (!k) {
            return interaction.reply({
                content: "❌ Nie ma takiego konkursu",
                ephemeral: true
            });
        }

        if (!k.participants.includes(user.id)) {
            return interaction.reply({
                content: "❌ Ten gracz nie jest w konkursie",
                ephemeral: true
            });
        }

        k.participants = k.participants.filter(x => x !== user.id);

        return interaction.reply({
            content: `✅ Usunięto <@${user.id}> z konkursu **${name}**`,
            ephemeral: true
        });
    }
});

// ================= START =================
client.login(TOKEN);