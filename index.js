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
let altImageUrl = process.env.ALT_IMAGE_URL

const pokemonSchema = new mongoose.Schema({
    id: Number,
    name: String,
    types: Array,
    abilities: Array,
    hiddenAbility: String,
    evolvesFrom: String,
    baseStats: {
        hp: Number,
        attack: Number,
        defense: Number,
        specialAttack: Number,
        specialDefense: Number,
        speed: Number,
    },
    image: String
})

const userSchema = new mongoose.Schema({
    userEmail: {
        type: String,
        required: true,
        unique: true,
    },
    lastLogin: {
        type: Date,
        required: true
    },
    customPokemon: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Pokemon'
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
                        let uniqueImg = ''
                        if (pokemonDetailData.id < 1018 && pokemonDetailData.id !== 1013) {
                            uniqueImg = `${imageUrl}/${pokemonDetailData.id}.png`
                        } else {
                            uniqueImg = `${altImageUrl}/${pokemonDetailData.id}.png`
                        }

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

app.get('/pokemon/:id', async (req, res) => {
    const id = req.params.id;
    const pokeApiUrl = `${pokeUrl}/pokemon/${id}`;
    const pokeSpeciesApiUrl = `${pokeUrl}/pokemon-species/${id}`;

    try {
        // Check if custom Pokémon exists in MongoDB
        const customPokemon = await Pokemon.findOne({ id: id }, { _id: 0, __v: 0 });

        if (customPokemon) {
            // If custom Pokémon exists, return it
            res.json(customPokemon);
        } else {
            // Fetch Pokémon details from the PokeAPI
            const [pokemonResponse, speciesResponse] = await Promise.all([
                fetch(pokeApiUrl),
                fetch(pokeSpeciesApiUrl),
            ]);

            if (!pokemonResponse.ok || !speciesResponse.ok) {
                throw new Error('Pokémon not found');
            }

            const [pokemonData, speciesData] = await Promise.all([
                pokemonResponse.json(),
                speciesResponse.json(),
            ]);

            const regularAbilities = [];
            const hiddenAbilities = [];

            pokemonData.abilities.forEach((ability) => {
                if (ability.is_hidden) {
                    hiddenAbilities.push(ability.ability.name);
                } else {
                    regularAbilities.push(ability.ability.name);
                }
            });

            // Process and save the updated Pokémon details to MongoDB
            const updatedPokemon = {
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
                image: getUniqueImageUrl(pokemonData.id),
            };

            // Save the updated Pokémon details to MongoDB
            await Pokemon.findOneAndUpdate({ id: id }, updatedPokemon, { upsert: true });

            // Return the updated Pokémon details, including the image URL
            res.json(updatedPokemon);
        }
    } catch (error) {
        console.error(error);
        res.status(404).json({
            error: 'Pokémon not found',
            details: error.message,
        });
    }
});


function getUniqueImageUrl(id) {
    if (id < 1018 && id !== 1013) {
        return `${imageUrl}/${id}.png`;
    } else if (id === 1013 || id > 1017) {
        return `${altImageUrl}/${id}.png`;
    } else {
        // Handle other cases or return a default image URL
        return `${imageUrl}/${id}.png`;
    }
}
app.post('/pokemon/add', (req, res) => {
    const {
        id,
        name,
        types,
        abilities,
        hiddenAbility,
        evolvesFrom,
        baseStats,
        image
    } = req.body;

    const newPokemon = new Pokemon({
        id,
        name,
        types,
        abilities,
        hiddenAbility,
        evolvesFrom,
        baseStats,
        image
    });

    const userId = req.body.userId
    newPokemon.user = userId

    newPokemon.save()
        .then(() => User.findByIdAndUpdate(userId, {customPokemon: newPokemon._id}))
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

app.delete('/pokemon/:id', (req, res) => {
    Pokemon.deleteOne({id: req.params.id})
    .then(() => {
        res.sendStatus(200)
    })
    .catch(err => {
        res.sendStatus(500)
    })
})

app.put('/pokemon/:id', (req, res) => {
    Pokemon.updateOne({id: req.params.id}, {
        id: req.body.id,
        name: req.body.name,
        types: req.body.types,
        abilities: req.body.abilities,
        hiddenAbility: req.body.hiddenAbility,
        evolvesFrom: req.body.evolvesFrom,
        baseStats: req.body.baseStats,
        image: req.body.image
    })
    .then(() => {
        res.sendStatus(200)
    })
    .catch(err => {
        res.sendStatus(500)
    })
})

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
