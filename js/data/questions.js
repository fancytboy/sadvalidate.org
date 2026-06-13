export const QUESTIONS = [
  {
    id: 'url-shortener-aws',
    title: 'URL Shortener',
    platform: 'AWS',
    difficulty: 'Easy',
    prompt: 'Design a service that converts long URLs into short codes and redirects users from a short code to the original URL.',
    requirements: [
      'Store and serve at least 100M URLs',
      'Redirect reads should respond in under 100ms',
      'Highly available with no single point of failure',
      'Short codes must be unique'
    ],
    expectsConcepts: ['unique ID / short-code generation', 'caching', 'CDN', 'read-heavy optimization', 'data partitioning']
  },
  {
    id: 'image-pipeline-azure',
    title: 'Image Upload & Processing Pipeline',
    platform: 'Azure',
    difficulty: 'Medium',
    prompt: 'Design a pipeline where users upload images that are then resized into multiple thumbnails and served back quickly to a global audience.',
    requirements: [
      'Handle bursty upload traffic',
      'Process (resize) images asynchronously',
      'Serve processed images with low global latency',
      'Durable storage of originals and derivatives'
    ],
    expectsConcepts: ['object/blob storage', 'async queue + workers', 'CDN', 'decoupling upload from processing']
  },
  {
    id: 'multi-region-chat',
    title: 'Multi-region Chat',
    platform: 'Agnostic',
    difficulty: 'Hard',
    prompt: 'Design a real-time chat system that supports millions of concurrent users across multiple geographic regions with low-latency message delivery.',
    requirements: [
      'Real-time bidirectional messaging',
      'Low latency across multiple regions',
      'Message durability and ordering within a conversation',
      'Scale to millions of concurrent connections'
    ],
    expectsConcepts: ['websockets / persistent connections', 'pub/sub fan-out', 'message queue', 'regional routing', 'data replication']
  },
  {
    id: 'rate-limiter',
    title: 'Distributed Rate Limiter',
    platform: 'Agnostic',
    difficulty: 'Easy',
    prompt: 'Design a rate limiter that restricts each client to N requests per time window across a fleet of API servers.',
    requirements: [
      'Enforce a shared limit across many servers',
      'Low added latency per request',
      'Handle server restarts without losing counters badly'
    ],
    expectsConcepts: ['shared counter store (cache)', 'sliding/fixed window algorithm', 'atomic increments', 'low latency']
  },
  {
    id: 'news-feed-aws',
    title: 'Social News Feed',
    platform: 'AWS',
    difficulty: 'Medium',
    prompt: 'Design the backend for a social news feed where users follow others and see a timeline of recent posts from people they follow.',
    requirements: [
      'Generate a personalized timeline per user',
      'Handle users with millions of followers (fan-out problem)',
      'Reads should be fast',
      'Support high write volume of new posts'
    ],
    expectsConcepts: ['fan-out on write vs read', 'caching', 'NoSQL data modeling', 'message queue', 'hot-key handling']
  },
  {
    id: 'notification-service-azure',
    title: 'Notification Service',
    platform: 'Azure',
    difficulty: 'Medium',
    prompt: 'Design a service that sends notifications (push, email, SMS) to users reliably, triggered by events from other services.',
    requirements: [
      'Accept notification events from many producers',
      'Deliver via multiple channels (push, email, SMS)',
      'Retry failed deliveries',
      'Avoid sending duplicate notifications'
    ],
    expectsConcepts: ['event ingestion', 'message queue', 'worker fan-out per channel', 'retry / dead-letter', 'idempotency']
  },
  {
    id: 'video-streaming',
    title: 'Video Streaming Backend',
    platform: 'GCP',
    difficulty: 'Hard',
    prompt: 'Design the backend for a video-on-demand platform that lets users upload videos and stream them smoothly at multiple qualities worldwide.',
    requirements: [
      'Transcode uploads into multiple resolutions',
      'Stream with low buffering globally',
      'Durable storage of large video files',
      'Scale to large concurrent viewership'
    ],
    expectsConcepts: ['object storage', 'async transcoding workers', 'adaptive bitrate', 'CDN', 'metadata database']
  },
  {
    id: 'kv-store',
    title: 'Distributed Key-Value Store',
    platform: 'Agnostic',
    difficulty: 'Hard',
    prompt: 'Design a distributed key-value store that remains available and performant as data grows beyond a single machine.',
    requirements: [
      'Horizontal scalability beyond one node',
      'High availability during node failures',
      'Predictable low-latency reads and writes',
      'Tunable consistency'
    ],
    expectsConcepts: ['consistent hashing / partitioning', 'replication', 'quorum / consistency tradeoffs', 'failure detection']
  },
  {
    id: 'metrics-pipeline',
    title: 'Metrics Collection Pipeline',
    platform: 'Agnostic',
    difficulty: 'Hard',
    prompt: 'Design a pipeline that collects, stores, and visualizes operational metrics (latency, error rates, throughput, resource usage) emitted by hundreds of microservices, with alerting when metrics breach thresholds.',
    requirements: [
      'Ingest high-volume metrics from hundreds of services with minimal overhead on them',
      'Store time-series data efficiently with configurable retention',
      'Support fast aggregation and queries for dashboards',
      'Trigger alerts when metrics cross thresholds',
      'Absorb traffic spikes without losing data'
    ],
    expectsConcepts: ['metrics agent: push vs pull scraping', 'buffering / streaming ingestion', 'time-series database', 'downsampling & retention', 'aggregation / rollups', 'alerting on thresholds', 'dashboards & visualization']
  }
];
