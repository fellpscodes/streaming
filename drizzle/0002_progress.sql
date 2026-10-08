CREATE TABLE `watch_progress` (
	`episode_id` integer PRIMARY KEY NOT NULL,
	`position_sec` real NOT NULL,
	`duration_sec` real NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `episodes`(`id`) ON UPDATE no action ON DELETE cascade
);
