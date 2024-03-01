const express = require("express");
require("dotenv").config();
const mongoose = require("mongoose");
const { userDataValidation } = require("./utils/authUtil");
const usermodel = require("./models/usermodel");
const bcrypt = require("bcrypt");
const validator = require("validator");
const session = require("express-session");
const mongoDbsession = require("connect-mongodb-session")(session);
const { isAuth } = require("./middlewares/authMiddleware");
const todoModel = require("./models/todoModel");
const rateLimiting = require("./middlewares/rateLimiting");
// constants
const app = express();
const PORT = process.env.PORT;
const uri =
  "mongodb+srv://Saikiran:Saikiran20@cluster0.vje1fsr.mongodb.net/TODOdataBase";

const store = new mongoDbsession({
  uri: uri,
  collection: "sessions",
});

// middlewares
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: false,
    store: store,
  })
);

app.use(express.static("public"));

// DB connection
mongoose
  .connect(uri)
  .then(() => {
    console.log("MongoDB Connected Succesfully");
  })
  .catch((err) => {
    console.log(err);
  });

// api
app.get("/", (req, res) => {
  res.send("TODO is working");
});

app.get("/register", (req, res) => {
  return res.render("registerPage.ejs");
});

app.post("/register", async (req, res) => {
  const { name, email, username, password } = req.body;

  //data validation
  try {
    await userDataValidation({ name, email, username, password });
  } catch (error) {
    return res.send({
      status: 400,
      message: "user data error",
      error: error,
    });
  }

  const userEmailExist = await usermodel.findOne({ email });
  if (userEmailExist) {
    return res.send({
      status: 400,
      message: "Email already exist",
    });
  }

  const userUsernameExist = await usermodel.findOne({ username });
  if (userUsernameExist) {
    return res.send({
      status: 400,
      message: "Username already exist",
    });
  }

  //check if email and username already exist or not
  const hashedPassword = await bcrypt.hash(
    password,
    parseInt(process.env.SALT)
  );

  //store the data in Db
  const userObj = new usermodel({
    //schema : client
    name: name,
    email: email,
    username: username,
    password: hashedPassword,
  });

  try {
    const userDb = await userObj.save();
    // return res.send({
    //   status: 201,
    //   message: "Registeration successfull",
    //   data: userDb,
    // });
    return res.redirect("/login");
  } catch (error) {
    return res.send({
      status: 500,
      message: "Database error",
      error: error,
    });
  }
});

app.get("/login", (req, res) => {
  return res.render("loginPage.ejs");
});

app.post("/login", async (req, res) => {
  const { loginId, password } = req.body;

  if (!loginId || !password) {
    return res.send({
      status: 400,
      message: "Missing credentials",
    });
  }

  try {
    let userDB;
    if (validator.isEmail(loginId)) {
      userDB = await usermodel.findOne({ email: loginId });
    } else {
      userDB = await usermodel.findOne({ username: loginId });
    }

    if (!userDB) {
      return res.send({
        status: 400,
        message: "User not found, please register",
      });
    }

    const isMatched = bcrypt.compare(password, userDB.password);

    if (!isMatched) {
      return res.send({
        status: 400,
        message: "Password does not matched",
      });
    }

    console.log(req.session);
    req.session.isAuth = true;
    req.session.user = {
      userId: userDB._id,
      email: userDB.email,
      username: userDB.username,
    };

    // return res.send({
    //   status: 200,
    //   message: "Login successfull",
    // });
    return res.redirect("/dashboard");
  } catch (error) {
    return res.send({
      status: 500,
      message: "Database error",
      error: error,
    });
  }
});

app.get("/dashboard", isAuth, (req, res) => {
  return res.render("dashboardPage");
});

app.post("/logout", isAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json("Logout unsuccessfull");
    } else {
      return res.status(200).redirect("/login");
    }
  });
});

app.post("/logout_from_all_devices", isAuth, async (req, res) => {
  // console.log(request.sesion.user.username);
  const username = req.session.user.username;
  const sessionSchema = new mongoose.Schema({ _id: String }, { strict: false });
  const sessionModel = mongoose.model("session", sessionSchema);

  try {
    const deletedb = await sessionModel.deleteMany({
      "session.user.username": username,
    });
    return res.status(200).redirect("/login");
  } catch (error) {
    return res.status(500).json(error);
  }
});

app.post("/create-item", isAuth,rateLimiting, async (req, res) => {
  //todoText, username
  const todoText = req.body.todo;
  const username = req.session.user.username;

  //data validation
  if (!todoText) {
    return res.status(400).json("Missing todo text.");
  } else if (typeof todoText !== "string") {
    return res.status(400).json("Todo is not a text");
  } else if (todoText.length < 3 || todoText.length > 200)
    return res.send({
      status: 400,
      message: "Todo length should be 3-200",
    });

  const todoObj = new todoModel({
    todo: todoText,
    username: username,
  });

  try {
    const todoDb = await todoObj.save();
    return res.send({
      status: 201,
      message: "Todo created successfully",
      data: todoDb,
    });
  } catch (error) {
    return res.send({
      status: 500,
      message: "Database error",
      error: error,
    });
  }
});

// app.get("/read-item", isAuth, async (req, res) => {
//   const username = req.session.user.username;
//   const SKIP = Number(req.session.skip) || 0;
//   const LIMIT = 5;
//   try {
//     const todos = await todoModel.aggregate([
//       {
//         $match: { username: username },
//       },
//       {
//         $facet: {
//           data: [{ $skip: SKIP }, { $limit: LIMIT }],
//         },
//       },
//     ]);

//     if (todos[0].data.length === 0) {
//         return res.send({
//           status: 4000,
//           message: SKIP === 0 ? "todos not found" : "No more todos",
//         });
//       }
    
//     console.log(todos[0].data);

//     return res.send({
//       status: 200,
//       mesaage: "Read Success",
//       data: todos[0].data,
//     });
//   } catch (error) {
//     return res.send({
//       status: 500,
//       mesage: "Database ERROR",
//       error: error,
//     });
//   }
// });





app.get("/read-item", isAuth, async (req, res) => {
  const username = req.session.user.username;
  const SKIP = Number(req.query.skip) || 0;
  const LIMIT = 5;

  //mongodb agggregate, skip, limit, match
  try {
    const todos = await todoModel.aggregate([
      {
        $match: { username: username },
      },
      {
        $facet: {
          data: [{ $skip: SKIP }, { $limit: LIMIT }],
        },
      },
    ]);

    if (todos[0].data.length === 0) {
      return res.send({
        status: 400,
        message: SKIP === 0 ? "No todos found" : "No more todos",
      });
    }

    console.log(todos[0].data);
    return res.send({
      status: 200,
      message: "Read success",
      data: todos[0].data,
    });
  } catch (error) {
    return res.send({
      status: 500,
      message: "Database error",
      error: error,
    });
  }
});






app.post("/edit-item", isAuth, async (req, res) => {
  //id, todo, username
  const { id, newData } = req.body;
  const username = req.session.user.username;

  //find the todo

  try {
    const todoDb = await todoModel.findOne({ _id: id });

    if (!todoDb) return res.status(404).json("Todo not found");

    //check the ownership
    if (username !== todoDb.username)
      return res.send({
        status: 400,
        message: "todo not found",
      });

    const prevTodo = await todoModel.findOneAndUpdate(
      { _id: id },
      { todo: newData } // {key1 : val1, key2:val2}
    );

    return res.send({
      status: 200,
      message: "Todo edited successfully",
      data: prevTodo,
    });
  } catch (error) {
    return res.send({
      status: 500,
      message: "Database error",
      error: error,
    });
  }
});

app.post("/delete-item", isAuth, async (req, res) => {
  const id = req.body.id;
  const username = req.session.user.username;

  if (!id)
    return res.send({
      status: 403,
      message: "Not authourized to edit",
    });

  //find, compare, delete
  try {
    const todoDb = await todoModel.findOne({ _id: id });

    if (!todoDb) return res.status(404).json(`Todo not found with id :${id}`);

    if (todoDb.username !== username)
      return res.status(403).json("Not allow to delete, authorization failed");

    const deletedTodo = await todoModel.findOneAndDelete({ _id: id });

    return res.send({
      status: 200,
      message: "Todo deleted successfully",
      data: deletedTodo,
    });
  } catch (error) {
    return res.send({
      status: 500,
      message: "Database error",
      error: error,
    });
  }
});

app.listen(PORT, () => {
  console.log(`server is running on PORT:${PORT}`);
});
