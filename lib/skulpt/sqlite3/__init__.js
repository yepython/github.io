var $builtinmodule = function(name) {
    var mod = {};

    // Стан модуля (ініціалізований лише при першому виклику)
    var _sqljsInitialized = false;
    var _sqljsPromise = null;

    // Функція для ініціалізації SQL.js
    function initSQLjs() {
        if (!_sqljsPromise) {
            _sqljsPromise = new Promise(function(resolve, reject) {
                if (typeof initSqlJs !== 'undefined') {
                    initSqlJs({
                        locateFile: function() {
                            return 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.wasm';
                        }
                    }).then(function(SQL) {
                        window.SQL = SQL;
                        _sqljsInitialized = true;
                        resolve();
                    }).catch(reject);
                } else {
                    reject(new Error('SQL.js not loaded. Add <script src="https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js"></script> to your page'));
                }
            });
        }
        return _sqljsPromise;
    }

    // Асинхронний обгортка для операцій з SQL.js
    function withSQLjs(callback) {
        return PythonIDE.runAsync(function(resolve, reject) {
            initSQLjs().then(function() {
                try {
                    resolve(callback());
                } catch (e) {
                    reject(e);
                }
            }).catch(reject);
        });
    }

    // Версії та константи (як раніше)
    mod.version = new Sk.builtin.str('3.37.2');
    mod.version_info = new Sk.builtin.tuple([3, 37, 2]);
    mod.sqlite_version = new Sk.builtin.str('3.37.2');
    mod.sqlite_version_info = new Sk.builtin.tuple([3, 37, 2]);
    mod.PARSE_DECLTYPES = Sk.ffi.remapToPy(1);
    mod.PARSE_COLNAMES = Sk.ffi.remapToPy(2);

    // Оновлений клас Connection з відкладеною ініціалізацією
    mod.Connection = Sk.misceval.buildClass(mod, function($gbl, $loc) {
        // Конструктор
        $loc.__init__ = new Sk.builtin.func(function(self, filename) {
            self.filename = Sk.ffi.remapToJs(filename);
            self.db = null;
            self.in_transaction = false;
            self._pending_operations = [];

            self.ensureInitialized = function() {
                return new Promise(function(resolve, reject) {
                    if (self.db) {
                        resolve();
                    } else {
                        initSQLjs().then(function() {
                            let stored = localStorage.getItem("sqlite_" + self.filename);
                            if (stored) {
                                try {
                                    let bytes = new Uint8Array(JSON.parse(stored));
                                    self.db = new SQL.Database(bytes);
                                } catch (e) {
                                    console.warn("Can't open  database from localStorage, create new file.");
                                    self.db = new SQL.Database();
                                }
                            } else {
                                self.db = new SQL.Database();
                            }
                            self._pending_operations.forEach(function(op) {
                                op();
                            });
                            self._pending_operations = [];
                            resolve();
                        }).catch(reject);
                    }
                });
            };
        });


        // Виконання SQL-запиту напряму через connection
        $loc.execute = new Sk.builtin.func(function(self, sql, parameters) {
            return PythonIDE.runAsync(function(resolve, reject) {
                self.ensureInitialized().then(function() {
                    try {
                        // Починаємо транзакцію, якщо ще не почалась
                        if (!self.in_transaction) {
                            self.db.run("BEGIN");
                            self.in_transaction = true;
                        }

                        var stmt = self.db.prepare(sql.v);
                        var result = stmt.getAsObject(parameters ? parameters.v : []);
                        stmt.free();

                        resolve(Sk.ffi.remapToPy(result));
                    } catch (e) {
                        reject(e);
                    }
                }).catch(reject);
            });
        });

        // Створення курсора
        $loc.cursor = new Sk.builtin.func(function(self) {
            return Sk.misceval.callsim(mod.Cursor, self);
        });

        // Завершення транзакції
        $loc.commit = new Sk.builtin.func(function(self) {
            if (self.in_transaction) {
                self.db.run("COMMIT");
                self.in_transaction = false;
            }
            return Sk.builtin.none.none$;
        });

        // Відкат транзакції
        $loc.rollback = new Sk.builtin.func(function(self) {
            if (self.in_transaction) {
                self.db.run("ROLLBACK");
                self.in_transaction = false;
            }
            return Sk.builtin.none.none$;
        });

        // Закриття з’єднання
        $loc.close = new Sk.builtin.func(function(self) {
            if (self.db) {
                try {
                    let binaryArray = self.db.export();
                    localStorage.setItem("sqlite_" + self.filename, JSON.stringify(Array.from(binaryArray)));
                    self.db.close();
                    self.db = null;
                } catch (e) {
                    console.error("Database saving error:", e);
                }
            }
            return Sk.builtin.none.none$;
        });

    }, 'Connection', []);


    // Клас Cursor
mod.Cursor = Sk.misceval.buildClass(mod, function($gbl, $loc) {
    $loc.__init__ = new Sk.builtin.func(function(self, connection) {
        self.connection = connection;
        self.description = Sk.builtin.none.none$;
        self.lastrowid = Sk.ffi.remapToPy(null);
        self.arraysize = Sk.ffi.remapToPy(1);
        self._results = [];
        self._row_index = 0;
        self._rowcount = -1;  // ← внутрішнє поле для властивості rowcount
    });

    $loc.close = new Sk.builtin.func(function(self) {
        return Sk.builtin.none.none$;
    });

    $loc.execute = new Sk.builtin.func(function(self, sql, parameters) {
        return PythonIDE.runAsync(function(resolve, reject) {
            self.connection.ensureInitialized().then(function() {
                try {
                    const upperSQL = sql.v.trim().toUpperCase();
                    if (!self.connection.in_transaction && upperSQL.startsWith("INSERT")) {
                        self.connection.db.run("BEGIN");
                        self.connection.in_transaction = true;
                    }

                    var stmt = self.connection.db.prepare(sql.v);

                    if (parameters) {
                        let jsParams = [];

                        if (parameters.tp$name === "tuple") {
                            for (let i = 0; i < parameters.v.length; i++) {
                                jsParams.push(Sk.ffi.remapToJs(parameters.v[i]));
                            }
                        } else {
                            jsParams = Sk.ffi.remapToJs(parameters);
                        }

                        stmt.bind(jsParams);
                    }

                    self._results = [];

                    while (stmt.step()) {
                        self._results.push(stmt.getAsObject());
                    }

                    stmt.free();

                    // === Підрахунок rowcount ===
                    let count = 0;
                    if (upperSQL.startsWith("SELECT")) {
                        count = self._results.length;
                    } else if (typeof self.connection.db.getRowsModified === "function") {
                        count = self.connection.db.getRowsModified();
                    }
                    self._rowcount = count;

                    resolve(Sk.builtin.none.none$);
                } catch (e) {
                    reject(e);
                }
            }).catch(reject);
        });
    });

    $loc.executemany = new Sk.builtin.func(function(self, sql, seq_of_parameters) {
        return PythonIDE.runAsync(function(resolve, reject) {
            self.connection.ensureInitialized().then(function() {
                try {
                    const upperSQL = sql.v.trim().toUpperCase();
                    if (!self.connection.in_transaction && upperSQL.startsWith("INSERT")) {
                        self.connection.db.run("BEGIN");
                        self.connection.in_transaction = true;
                    }

                    if (!Array.isArray(seq_of_parameters.v)) {
                        throw new Error("parameters must be a list of tuples");
                    }

                    let total = 0;

                    for (let i = 0; i < seq_of_parameters.v.length; i++) {
                        let paramSet = seq_of_parameters.v[i];
                        let jsParams = [];

                        if (paramSet.tp$name === "tuple") {
                            for (let j = 0; j < paramSet.v.length; j++) {
                                jsParams.push(Sk.ffi.remapToJs(paramSet.v[j]));
                            }
                        } else {
                            jsParams = Sk.ffi.remapToJs(paramSet);
                        }

                        let stmt = self.connection.db.prepare(sql.v);
                        stmt.bind(jsParams);
                        while (stmt.step()) {
                            // ігнорування результату
                        }
                        stmt.free();

                        total += 1;
                    }

                    self._rowcount = total;

                    resolve(Sk.builtin.none.none$);
                } catch (e) {
                    reject(e);
                }
            }).catch(reject);
        });
    });

    $loc.fetchone = new Sk.builtin.func(function(self) {
        if (self._row_index < self._results.length) {
            var row = self._results[self._row_index];
            self._row_index++;
            return Sk.ffi.remapToPy(row);
        }
        return Sk.builtin.none.none$;
    });

    $loc.fetchmany = new Sk.builtin.func(function(self, size) {
        size = size ? size.v : self.arraysize.v;
        var result = [];
        for (var i = 0; i < size && self._row_index < self._results.length; i++) {
            result.push(self._results[self._row_index]);
            self._row_index++;
        }
        return Sk.ffi.remapToPy(result);
    });

    $loc.fetchall = new Sk.builtin.func(function(self) {
        var pyResults = self._results.map(function(row) {
            var values = Object.values(row).map(Sk.ffi.remapToPy);
            return new Sk.builtins.tuple(values);
        });
        return new Sk.builtins.list(pyResults);
    });

    $loc.__iter__ = new Sk.builtin.func(function(self) {
        return Sk.builtin.makeGenerator(function() {
            if (this.$index >= this.$results.length) {
                return undefined;
            }
            return this.$results[this.$index++];
        }, {
            $obj: self,
            $index: 0,
            $results: self._results
        });
    });

    // === Властивість rowcount ===
    var get_rowcount = new Sk.builtin.func(function(self) {
        return Sk.ffi.remapToPy(self._rowcount);
    });

    var set_rowcount = new Sk.builtin.func(function(self, value) {
        self._rowcount = Sk.ffi.remapToJs(value);
    });

    $loc.rowcount = Sk.misceval.callsimOrSuspend(Sk.builtins.property, get_rowcount, set_rowcount);

}, 'Cursor', []);


    // Функція connect
    mod.connect = new Sk.builtin.func(function(filename) {
        return withSQLjs(function() {
            return Sk.misceval.callsim(mod.Connection, filename);
        });
    });

    // Додаткові функції
    mod.complete_statement = new Sk.builtin.func(function(sql) {
        return Sk.ffi.remapToPy(/;\s*$/.test(sql.v));
    });

// load file to localStorage
mod.loadFromFile = new Sk.builtin.func(function (filename) {
    return PythonIDE.runAsync(function (resolve, reject) {
        initSQLjs().then(function () {
            let input = document.createElement("input");
            input.type = "file";
            input.accept = ".db,.sqlite";

            input.onchange = function (event) {
                let file = event.target.files[0];
                let reader = new FileReader();

                reader.onload = function () {
                    try {
                        let uInt8Array = new Uint8Array(reader.result);
                        localStorage.setItem("sqlite_" + Sk.ffi.remapToJs(filename), JSON.stringify(Array.from(uInt8Array)));
                        resolve(Sk.builtin.none.none$);
                    } catch (e) {
                        reject(e);
                    }
                };

                reader.onerror = reject;
                reader.readAsArrayBuffer(file);
            };

            input.click();
        }).catch(reject);
    });
});
// save file from localStorage
mod.saveToFile = new Sk.builtin.func(function (filename) {
    return PythonIDE.runAsync(function (resolve, reject) {
        try {
            let key = "sqlite_" + Sk.ffi.remapToJs(filename);
            let stored = localStorage.getItem(key);
            if (!stored) {
                reject(new Error("Файл не знайдено в localStorage"));
                return;
            }

            let bytes = new Uint8Array(JSON.parse(stored));
            let blob = new Blob([bytes], { type: "application/octet-stream" });
            let url = URL.createObjectURL(blob);

            let a = document.createElement("a");
            a.href = url;
            a.download = Sk.ffi.remapToJs(filename);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            resolve(Sk.builtin.none.none$);
        } catch (e) {
            reject(e);
        }
    });
});
// delete file from localStorage
mod.deleteFile = new Sk.builtin.func(function (filename) {
    let key = "sqlite_" + Sk.ffi.remapToJs(filename);
    localStorage.removeItem(key);
    return Sk.builtin.none.none$;
});





    return mod;
};
