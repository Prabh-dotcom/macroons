
// models/productModel.js
//
// Inventory form me "Category" aur "Product Name/Model" free text se aate
// hain, lekin database normalized hai (product_categories -> products).
// Yeh helper functions "find-or-create" pattern follow karte hain:
// agar category/product pehle se hai to wahi use karo, warna naya bana do.
// Isse duplicate categories/products nahi banenge chahe form se jo bhi
// text aaye.

const db = require("../config/db");

exports.findOrCreateCategory = async (categoryName) => {
    const [existing] = await db.query(
        "SELECT category_id FROM product_categories WHERE category_name = ?",
        [categoryName]
    );

    if (existing.length > 0) {
        return existing[0].category_id;
    }

    const [result] = await db.query(
        "INSERT INTO product_categories (category_name) VALUES (?)",
        [categoryName]
    );
    return result.insertId;
};

exports.findOrCreateProduct = async ({ category_id, product_name, model_name, warranty_months }) => {
    const [existing] = await db.query(
        "SELECT product_id FROM products WHERE product_name = ? AND model_name = ?",
        [product_name, model_name]
    );

    if (existing.length > 0) {
        return existing[0].product_id;
    }

    const [result] = await db.query(
        `INSERT INTO products (category_id, product_name, model_name, warranty_months)
         VALUES (?, ?, ?, ?)`,
        [category_id, product_name, model_name, warranty_months || 12]
    );
    return result.insertId;
};

exports.getAllCategories = async () => {
    const [rows] = await db.query("SELECT category_id, category_name FROM product_categories ORDER BY category_name");
    return rows;
};
