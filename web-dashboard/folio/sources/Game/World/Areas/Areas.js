import { Game } from '../../Game.js'
import { LandingArea } from './LandingArea.js'
import { CircuitArea } from './CircuitArea.js'

export class Areas
{
    constructor()
    {
        this.game = Game.getInstance()

        const list = [
            [ 'landing', LandingArea ],
            [ 'circuit', CircuitArea ],
        ]

        const model = [...this.game.resources.areasModel.scene.children]

        for(const child of model)
        {
            for(const [ name, AreaClass ] of list)
            {
                if(child.name.startsWith(name))
                    this[name] = new AreaClass(child)
            }
        }
    }
}
