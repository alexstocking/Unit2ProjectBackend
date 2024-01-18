import jwt from 'jsonwebtoken'

const secretKey = process.env.SECRET_KEY

const authenticateUser = (req, res, next) => {
    const token = req.headers.authorization

    if(!token) {
        return res.status(401).json({ message: 'Unauthorized '})
    }

    try {
        const decoded = jwt.verify(token, secretKey)
        req.user = decoded
        next()
    } catch (error) {
        console.error(error)
        return res.status(401).json({ message: 'Unauthorized'})
    }
}

export default authenticateUser