import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import bodyParser from 'body-parser'
import mongoose from 'mongoose'

const app = express()

app.use(cors())
app.use(bodyParser.json())

const port = process.env.PORT || 4000

app.listen(port, () => {
    console.log(`Listening on port: ${port}`)
})

mongoose.connect(process.env.DATABASE_URL)
let pokeUrl = process.env.POKEDATABASE_URL
let imageUrl = process.env.IMAGE_URL

const pokemonSchema = new mongoose.Schema({
    id: Number,
    name: String,
    types: Array,
    abilities: Array,
    hidAbility: String,
    evolvesFrom: String,
    baseStatNumbers: {
        hp: Number,
        attack: Number,
        defense: Number,
        specialAttack: Number,
        specialDefense: Number,
        speed: Number,
    },
    img: String
})

const userSchema = new mongoose.Schema({
    userEmail: {
        type: String,
        required: true
    },
    lastLogin: {
        type: Date,
        required: true
    }
})

const Pokemon = mongoose.model('Pokemon', pokemonSchema)
const User = mongoose.model('User', userSchema)


app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to the Pokedex'
    })
})


app.get('/pokemon', (req, res) => {
    const limit = 1025;
    const pokeListUrl = `${pokeUrl}/pokemon?limit=${limit}`;

    fetch(pokeListUrl)
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Failed to fetch data from the Pokemon list endpoint`);
            }
            return response.json();
        })
        .then((allPokemon) => {
            const pokeApiPokemonList = allPokemon.results.map((pokemon) => {
                return fetch(`${pokeUrl}/pokemon/${pokemon.name}`)
                    .then((pokemonDetailResponse) => {
                        if (!pokemonDetailResponse.ok) {
                            throw new Error(`Failed to fetch data for ${pokemon.name}`);
                        }
                        return pokemonDetailResponse.json();
                    })
                    .then((pokemonDetailData) => {
                        const uniqueImg = `${imageUrl}/${pokemonDetailData.id}.png`;

                        return {
                            id: pokemonDetailData.id,
                            name: pokemonDetailData.name,
                            image: uniqueImg,
                        };
                    });
            });

            return Promise.all(pokeApiPokemonList);
        })
        .then((pokeApiPokemonList) => {
            return Pokemon.find({}, { _id: 0, __v: 0 }).then((customPokemonList) => {
                const allPokemonList = [...pokeApiPokemonList, ...customPokemonList];
                res.json(allPokemonList);
            });
        })
        .catch((error) => {
            console.error(error);
            res.status(500).json({
                error: 'Internal Server Error',
                details: error.message,
            });
        });
});

app.get('/pokemon/:id', (req, res) => {
    const id = req.params.id;
    const pokeApiUrl = `${pokeUrl}/pokemon/${id}`;
    const pokeSpeciesApiUrl = `${pokeUrl}/pokemon-species/${id}`;

    // Check if custom Pokémon exists in MongoDB
    Pokemon.findOne({ id: id }, { _id: 0, __v: 0 })
        .then((customPokemon) => {
            if (customPokemon) {
                if (!res.headersSent) {
                    // If response hasn't been sent, send the custom Pokémon
                    res.json(customPokemon);
                }
            } else {
                // Fetch Pokémon from the PokeAPI
                return Promise.all([
                    fetch(pokeApiUrl),
                    fetch(pokeSpeciesApiUrl),
                ]).then(([pokemonResponse, speciesResponse]) => {
                    // Check if the response is not OK (e.g., 404 Not Found)
                    if (!pokemonResponse.ok || !speciesResponse.ok) {
                        throw new Error('Pokémon not found');
                    }

                    // Parse the responses as JSON
                    return Promise.all([
                        pokemonResponse.json(),
                        speciesResponse.json(),
                    ]);
                });
            }
        })
        .then(([pokemonData, speciesData]) => {
            // Check if response has already been sent
            if (!res.headersSent) {
                const regularAbilities = [];
                const hiddenAbilities = [];

                pokemonData.abilities.forEach((ability) => {
                    if (ability.is_hidden) {
                        hiddenAbilities.push(ability.ability.name);
                    } else {
                        regularAbilities.push(ability.ability.name);
                    }
                });

                const uniqueImg = `${imageUrl}/${pokemonData.id}.png`;

                res.json({
                    id: pokemonData.id,
                    name: pokemonData.name,
                    types: pokemonData.types.map((type) => type.type.name),
                    abilities: regularAbilities,
                    hiddenAbility: hiddenAbilities.length > 0 ? hiddenAbilities[0] : null,
                    evolvesFrom: speciesData.evolves_from_species ? speciesData.evolves_from_species.name : null,
                    baseStats: {
                        hp: pokemonData.stats[0].base_stat,
                        attack: pokemonData.stats[1].base_stat,
                        defense: pokemonData.stats[2].base_stat,
                        specialAttack: pokemonData.stats[3].base_stat,
                        specialDefense: pokemonData.stats[4].base_stat,
                        speed: pokemonData.stats[5].base_stat,
                    },
                    image: uniqueImg,
                });
            }
        })
        .catch((error) => {
            // Check if response has already been sent
            if (!res.headersSent) {
                console.error(error);
                res.status(404).json({
                    error: 'Pokémon not found',
                    details: error.message,
                });
            }
        });
});

app.post('/pokemon/add', (req, res) => {
    const {
        id,
        name,
        types,
        abilities,
        hidAbility,
        evolvesFrom,
        baseStatNumbers,
        img
    } = req.body;

    const newPokemon = new Pokemon({
        id,
        name,
        types,
        abilities,
        hidAbility,
        evolvesFrom,
        baseStatNumbers,
        img
    });

    newPokemon.save()
        .then(() => {
            res.status(201).json({
                message: 'Pokemon added successfully',
                pokemon: newPokemon
            });
        })
        .catch((error) => {
            console.error(error);
            res.status(500).json({
                error: 'Internal Server Error',
                details: error.message,
            });
        });
});

app.post('/user/login', async (req, res) => {
    const now = new Date()

    if( await User.countDocuments({"userEmail": req.body.userEmail}) === 0) {
        const newUser = new User ({
            userEmail: req.body.userEmail,
            lastLogin: now
        })
        newUser.save()
        .then(() => {
            res.sendStatus(200)
        })
        .catch(err => {
            res.sendStatus(500)
        })
    } else {
        await User.findOneAndUpdate({"userEmail": req.body.userEmail}, {lastLogin: now})
        res.sendStatus(200)
    }
})

app.delete('/pokemon/:id', (req, res) => {
    Pokemon.deleteOne({id: req.params.id})
    .then(() => {
        res.sendStatus(200)
    })
    .catch(err => {
        res.sendStatus(500)
    })
})
