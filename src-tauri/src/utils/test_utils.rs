use sqlx::sqlite::{SqliteConnectOptions, SqlitePool};
use std::env;

pub async fn setup_test_db() -> SqlitePool {
    let mut temp_db = env::temp_dir();
    temp_db.push(format!("test_db_{}.sqlite", rand::random::<u32>()));

    let options = SqliteConnectOptions::new()
        .filename(&temp_db)
        .create_if_missing(true);

    let pool = SqlitePool::connect_with(options)
        .await
        .expect("Failed to connect to test db");

    let migrations = sqlx::migrate!("./migrations");

    migrations
        .run(&pool)
        .await
        .expect("Failed to run migrations");

    pool
}
