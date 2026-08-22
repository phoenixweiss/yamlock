<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const formats = {
  yaml: [
    { prefix: "database:", value: "" },
    { prefix: "  host: ", value: "db.internal" },
    { prefix: "  username: ", value: "app" },
    {
      prefix: "  password: ",
      value: "open-sesame",
      encrypted: "yl|2|aes-256-gcm|scrypt|…|qf8G",
    },
    { prefix: "services:", value: "" },
    { prefix: "  payments:", value: "" },
    {
      prefix: "    token: ",
      value: "sk_demo_7bdc",
      encrypted: "yl|2|aes-256-gcm|scrypt|…|t91K",
    },
    { prefix: "  mailer:", value: "" },
    {
      prefix: "    api_key: ",
      value: "mail_demo_f31a",
      encrypted: "yl|2|aes-256-gcm|scrypt|…|m2Lp",
    },
  ],
  json: [
    { prefix: "{", value: "" },
    { prefix: '  "database": {', value: "" },
    { prefix: '    "host": ', value: '"db.internal",' },
    { prefix: '    "username": ', value: '"app",' },
    {
      prefix: '    "password": ',
      value: '"open-sesame"',
      encrypted: '"yl|2|aes-256-gcm|scrypt|…|qf8G"',
    },
    { prefix: "  },", value: "" },
    {
      prefix: '  "apiToken": ',
      value: '"sk_demo_7bdc",',
      encrypted: '"yl|2|aes-256-gcm|scrypt|…|t91K",',
    },
    {
      prefix: '  "mailerKey": ',
      value: '"mail_demo_f31a"',
      encrypted: '"yl|2|aes-256-gcm|scrypt|…|m2Lp"',
    },
    { prefix: "}", value: "" },
  ],
};

const format = ref("yaml");
const progress = ref(42);
const dragging = ref(false);
const stage = ref(null);
const reducedMotion = ref(false);
const lines = computed(() => formats[format.value]);
const scannerStyle = computed(() => ({ "--scan": `${progress.value}%` }));
const labelFlipped = computed(() => progress.value > 76);
const encryptedClip = computed(() => ({
  clipPath: `inset(0 ${100 - progress.value}% 0 0)`,
}));
const status = computed(() => {
  if (progress.value === 0) return "plaintext visible";
  if (progress.value === 100) return "payloads authenticated";
  if (progress.value < 18) return "reading paths";
  if (progress.value < 82) return "sealing selected values";
  return "payloads authenticated";
});

const sparks = ["7", "f", "|", "2", "a", "9", "y", "l", "G", "3", "|", "K"];
let animationFrame;
let lastTimestamp = 0;
let direction = 1;
let resumeAt = 0;
let motionQuery;

function pauseAutomation(duration = 2600) {
  resumeAt = performance.now() + duration;
}

function setProgress(value) {
  progress.value = Math.min(100, Math.max(0, value));
}

function setFromPointer(event) {
  const bounds = stage.value.getBoundingClientRect();
  const nextProgress = ((event.clientX - bounds.left) / bounds.width) * 100;
  setProgress(nextProgress <= 2 ? 0 : nextProgress >= 98 ? 100 : nextProgress);
  pauseAutomation();
}

function startDrag(event) {
  dragging.value = true;
  event.currentTarget.setPointerCapture(event.pointerId);
  setFromPointer(event);
}

function drag(event) {
  if (dragging.value) setFromPointer(event);
}

function stopDrag(event) {
  if (!dragging.value) return;
  dragging.value = false;
  event.currentTarget.releasePointerCapture(event.pointerId);
  pauseAutomation(1800);
}

function scrub(event) {
  setProgress(Number(event.target.value));
  pauseAutomation(3200);
}

function jumpTo(value) {
  setProgress(value);
  direction = value === 100 ? -1 : 1;
  pauseAutomation(3200);
}

function selectFormat(nextFormat) {
  format.value = nextFormat;
  progress.value = 38;
  direction = 1;
  pauseAutomation(900);
}

function syncMotionPreference(event) {
  reducedMotion.value = event.matches;
  if (event.matches) progress.value = 58;
}

function animate(timestamp) {
  const delta = Math.min(timestamp - lastTimestamp, 40);
  lastTimestamp = timestamp;

  if (!reducedMotion.value && !dragging.value && timestamp > resumeAt) {
    progress.value += direction * delta * 0.0075;

    if (progress.value >= 100) {
      progress.value = 100;
      direction = -1;
      resumeAt = timestamp + 900;
    } else if (progress.value <= 0) {
      progress.value = 0;
      direction = 1;
      resumeAt = timestamp + 700;
    }
  }

  animationFrame = requestAnimationFrame(animate);
}

onMounted(() => {
  motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  reducedMotion.value = motionQuery.matches;
  motionQuery.addEventListener("change", syncMotionPreference);
  animationFrame = requestAnimationFrame(animate);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame);
  motionQuery?.removeEventListener("change", syncMotionPreference);
});
</script>

<template>
  <div class="scanner" :style="scannerStyle">
    <div class="scanner-topbar">
      <div class="format-switch" aria-label="Configuration format">
        <button
          v-for="name in Object.keys(formats)"
          :key="name"
          type="button"
          :class="{ active: format === name }"
          :aria-pressed="format === name"
          @click="selectFormat(name)"
        >
          {{ name }}
        </button>
      </div>

      <div class="scanner-status" aria-live="polite">
        <span></span>
        {{ status }}
      </div>
    </div>

    <div
      ref="stage"
      class="code-stage"
      @pointerdown="startDrag"
      @pointermove="drag"
      @pointerup="stopDrag"
      @pointercancel="stopDrag"
    >
      <div class="code-layer code-plain" aria-hidden="true">
        <div
          v-for="(line, index) in lines"
          :key="`plain-${format}-${index}`"
          class="code-line"
        >
          <span class="line-number">{{
            String(index + 1).padStart(2, "0")
          }}</span>
          <span class="code-prefix">{{ line.prefix }}</span>
          <span :class="line.encrypted ? 'plain-value' : 'code-value'">{{
            line.value
          }}</span>
        </div>
      </div>

      <div class="code-layer code-encrypted" :style="encryptedClip">
        <div
          v-for="(line, index) in lines"
          :key="`locked-${format}-${index}`"
          class="code-line"
        >
          <span class="line-number">{{
            String(index + 1).padStart(2, "0")
          }}</span>
          <span class="code-prefix">{{ line.prefix }}</span>
          <span :class="line.encrypted ? 'locked-value' : 'code-value'">
            {{ line.encrypted ?? line.value }}
          </span>
        </div>
      </div>

      <div class="scan-field" aria-hidden="true">
        <span
          v-for="(spark, index) in sparks"
          :key="`${spark}-${index}`"
          class="scan-spark"
          :style="{
            '--spark-y': `${8 + ((index * 19) % 82)}%`,
            '--spark-delay': `${(index % 6) * -0.19}s`,
            '--spark-drift': `${index % 2 ? 1 : -1}`,
          }"
        >
          {{ spark }}
        </span>
      </div>

      <div
        class="scan-line"
        :class="{ 'is-at-end': progress === 100 }"
        aria-hidden="true"
      >
        <span class="scan-label" :class="{ 'is-flipped': labelFlipped }">
          encrypt / {{ Math.round(progress) }}%
        </span>
      </div>

      <div class="stage-hint">drag the beam</div>
    </div>

    <div class="scanner-footer">
      <button type="button" @click="jumpTo(0)">plaintext</button>
      <input
        :value="progress"
        type="range"
        min="0"
        max="100"
        step="0.5"
        aria-label="Encryption scanner position"
        @input="scrub"
      />
      <button type="button" @click="jumpTo(100)">encrypted</button>
    </div>
  </div>
</template>
