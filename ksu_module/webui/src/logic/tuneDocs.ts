import type { MessageKey } from './i18n';

export interface TuneValueDoc {
  /** The value as the kernel spells it, which is what the option is matched against. */
  value: string;
  text: MessageKey;
}

export interface TuneDoc {
  key: string;
  title: MessageKey;
  hint: MessageKey;
  about: MessageKey;
  values: readonly TuneValueDoc[];
  advice: MessageKey;
}

const CPU_GOVERNORS: readonly TuneValueDoc[] = [
  { value: 'schedutil', text: 'tune.cpu_governor.schedutil' },
  { value: 'performance', text: 'tune.cpu_governor.performance' },
  { value: 'powersave', text: 'tune.cpu_governor.powersave' },
  { value: 'ondemand', text: 'tune.cpu_governor.ondemand' },
  { value: 'conservative', text: 'tune.cpu_governor.conservative' },
  { value: 'userspace', text: 'tune.cpu_governor.userspace' },
];

/** Keys must match `tune.sh keys`; tests/webui/tune_dump.test.mjs fails when they drift apart. */
export const TUNE_DOCS: readonly TuneDoc[] = [
  {
    key: 'io_scheduler',
    title: 'tune.io_scheduler.title',
    hint: 'tune.io_scheduler.hint',
    about: 'tune.io_scheduler.about',
    values: [
      { value: 'noop', text: 'tune.io_scheduler.noop' },
      { value: 'deadline', text: 'tune.io_scheduler.deadline' },
      { value: 'cfq', text: 'tune.io_scheduler.cfq' },
      { value: 'mq-deadline', text: 'tune.io_scheduler.mq-deadline' },
      { value: 'kyber', text: 'tune.io_scheduler.kyber' },
      { value: 'bfq', text: 'tune.io_scheduler.bfq' },
    ],
    advice: 'tune.io_scheduler.advice',
  },
  {
    key: 'cpu_governor_little',
    title: 'tune.cpu_governor_little.title',
    hint: 'tune.cpu_governor_little.hint',
    about: 'tune.cpu_governor_little.about',
    values: CPU_GOVERNORS,
    advice: 'tune.cpu_governor.advice',
  },
  {
    key: 'cpu_governor_big',
    title: 'tune.cpu_governor_big.title',
    hint: 'tune.cpu_governor_big.hint',
    about: 'tune.cpu_governor_big.about',
    values: CPU_GOVERNORS,
    advice: 'tune.cpu_governor.advice',
  },
  {
    key: 'gpu_governor',
    title: 'tune.gpu_governor.title',
    hint: 'tune.gpu_governor.hint',
    about: 'tune.gpu_governor.about',
    values: [
      { value: 'msm-adreno-tz', text: 'tune.gpu_governor.msm-adreno-tz' },
      { value: 'performance', text: 'tune.gpu_governor.performance' },
      { value: 'powersave', text: 'tune.gpu_governor.powersave' },
      { value: 'simple_ondemand', text: 'tune.gpu_governor.simple_ondemand' },
    ],
    advice: 'tune.gpu_governor.advice',
  },
  {
    key: 'tcp_congestion',
    title: 'tune.tcp_congestion.title',
    hint: 'tune.tcp_congestion.hint',
    about: 'tune.tcp_congestion.about',
    values: [
      { value: 'cubic', text: 'tune.tcp_congestion.cubic' },
      { value: 'bbr', text: 'tune.tcp_congestion.bbr' },
      { value: 'reno', text: 'tune.tcp_congestion.reno' },
      { value: 'westwood', text: 'tune.tcp_congestion.westwood' },
    ],
    advice: 'tune.tcp_congestion.advice',
  },
  {
    key: 'thp',
    title: 'tune.thp.title',
    hint: 'tune.thp.hint',
    about: 'tune.thp.about',
    values: [
      { value: 'always', text: 'tune.thp.always' },
      { value: 'madvise', text: 'tune.thp.madvise' },
      { value: 'never', text: 'tune.thp.never' },
    ],
    advice: 'tune.thp.advice',
  },
  {
    key: 'swappiness',
    title: 'tune.swappiness.title',
    hint: 'tune.swappiness.hint',
    about: 'tune.swappiness.about',
    values: [
      { value: '0', text: 'tune.swappiness.0' },
      { value: '60', text: 'tune.swappiness.60' },
      { value: '100', text: 'tune.swappiness.100' },
    ],
    advice: 'tune.swappiness.advice',
  },
];
