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
        GatewayIntentBits.Guilds
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
}

// ===== FORMAT TIME =====
function formatTime(ms) {
    if (ms < 60000) return `${Math.floor(ms / 1000)}s`;

    if (ms < 3600000) {
        const m = Math.floor(ms / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        return `${m}m ${s}s`;
    }

    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
}

// ===== READY =====
client.once("ready", async () => {
    console.log(`Bot działa 🔥 (${client.user.tag})`);

    const commands = [
        new SlashCommandBuilder().setName("konkurs").setDescription("Tworzy konkurs")
    ].map(c => c.toJSON());

    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(
        Routes.applicationCommands(client.user.id),
        { body: commands }
    );
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
                new TextInputBuilder().setCustomId("winners").setLabel("Wygrywa").setStyle(TextInputStyle.Short)
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
            .setColor("#f1c40f")
            .setDescription(`👥 0\n⏰ ${formatTime(duration)}\n🏆 ${winners}\n\n${desc}`);

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
            participants: [],
            winners,
            endTime,
            msg,
            desc
        };

        // ===== REAL TIME TIMER =====
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
                    `👥 ${k.participants.length}\n⏰ ${formatTime(left)}\n🏆 ${k.winners}\n\n${desc}`
                );

            k.msg.edit({ embeds: [updated] }).catch(() => {});

        }, 1000);
    }

    // ===== JOIN =====
    if (interaction.isButton()) {

        await interaction.deferUpdate(); // 🔥 FIX NA ERROR

        const [_, name] = interaction.customId.split("_");
        const k = konkursy[name];
        if (!k) return;

        if (!k.participants.includes(interaction.user.id)) {
            k.participants.push(interaction.user.id);
        }
    }
});

// ===== END =====
async function endKonkurs(name) {
    const k = konkursy[name];
    if (!k) return;

    const winners = k.participants
        .sort(() => 0.5 - Math.random())
        .slice(0, k.winners);

    await k.msg.channel.send(
        `🏁 KONIEC\n🏆 ${winners.map(x => `<@${x}>`).join(", ") || "brak"}`
    );

    delete konkursy[name];
}

client.login(TOKEN);
